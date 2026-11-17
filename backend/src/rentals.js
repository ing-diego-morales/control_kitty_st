import { Router } from "express";
import { pool } from "./db.js";

const REASONS = ["down", "changed", "stolen", "other"];

export const RENTAL_SELECT = `
  SELECT rt.*, c.name AS customer_name, c.phone AS customer_phone,
         a.email AS account_email, a.is_down AS account_down,
         a.product_id AS service_id, p.name AS product_name,
         b.total AS batch_total, b.live AS batch_live,
         DATEDIFF(rt.end_date, CURDATE()) AS days_left,
         CASE
           WHEN rt.status = 'cancelled' THEN 'cancelled'
           WHEN rt.end_date < CURDATE() THEN 'expired'
           WHEN rt.end_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) THEN 'expiring'
           ELSE 'active'
         END AS state
  FROM rentals rt
  JOIN customers c ON c.id = rt.customer_id
  JOIN accounts a ON a.id = rt.account_id
  JOIN products p ON p.id = a.product_id
  LEFT JOIN (
    SELECT batch_id, COUNT(*) AS total, SUM(status = 'active') AS live
    FROM rentals WHERE batch_id IS NOT NULL GROUP BY batch_id
  ) b ON b.batch_id = rt.batch_id`;

const router = Router();

const SORTS = {
  customer: (d) => `customer_name ${d}, id ASC`,
  product: (d) => `product_name ${d}, account_email ${d}`,
  end_date: (d) => `end_date ${d}, id ASC`,
  state: (d) =>
    `FIELD(state, 'expired', 'expiring', 'active', 'cancelled') ${d}, end_date ASC`,
  price: (d) => `price ${d}, id ASC`,
};

const cleanIds = (v) =>
  (Array.isArray(v) ? v : [])
    .slice(0, 500)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

async function withBatch(db, ids) {
  const [batches] = await db.query(
    "SELECT DISTINCT batch_id FROM rentals WHERE id IN (?) AND batch_id IS NOT NULL",
    [ids],
  );
  if (!batches.length) return ids;
  const [rows] = await db.query(
    "SELECT id FROM rentals WHERE status = 'active' AND (id IN (?) OR batch_id IN (?))",
    [ids, batches.map((b) => b.batch_id)],
  );
  return rows.map((r) => r.id);
}

async function dropLonelyBatches(db) {
  const [lonely] = await db.query(
    "SELECT batch_id FROM rentals WHERE batch_id IS NOT NULL GROUP BY batch_id HAVING COUNT(*) < 2",
  );
  if (lonely.length)
    await db.query("UPDATE rentals SET batch_id = NULL WHERE batch_id IN (?)", [
      lonely.map((l) => l.batch_id),
    ]);
}

router.get("/alerts", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT customer_id, customer_name, COUNT(*) AS accounts, MIN(days_left) AS worst_days
       FROM (${RENTAL_SELECT}) x
       WHERE status = 'active' AND days_left < 0
       GROUP BY customer_id, customer_name
       ORDER BY worst_days ASC`,
    );
    const count = rows.reduce((s, r) => s + Number(r.accounts), 0);
    res.json({ count, customers: rows.length, items: rows.slice(0, 6) });
  } catch (e) {
    next(e);
  }
});

router.get("/by-customer/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (${RENTAL_SELECT}) x
       WHERE customer_id = ? AND status = 'active' ORDER BY end_date ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/batch/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query(
      `SELECT rt.batch_id, MAX(c.name) AS customer_name, COUNT(*) AS total,
              SUM(rt.status = 'active') AS live,
              MIN(rt.start_date) AS start_date,
              MIN(CASE WHEN rt.status = 'active' THEN rt.end_date END) AS first_end,
              MAX(CASE WHEN rt.status = 'active' THEN rt.end_date END) AS last_end,
              COALESCE(SUM(CASE WHEN rt.status = 'active' THEN rt.price END), 0) AS live_price
       FROM rentals rt
       JOIN customers c ON c.id = rt.customer_id
       WHERE rt.batch_id = ?
       GROUP BY rt.batch_id`,
      [id],
    );
    if (!row) return res.status(404).json({ error: "Ese lote ya no existe" });
    const [live] = await pool.query(
      "SELECT id FROM rentals WHERE batch_id = ? AND status = 'active' ORDER BY id",
      [id],
    );
    res.json({
      ...row,
      total: Number(row.total),
      live: Number(row.live),
      live_price: Number(row.live_price),
      live_ids: live.map((r) => r.id),
    });
  } catch (e) {
    next(e);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const dir = req.query.dir === "desc" ? "DESC" : "ASC";
    const orderBy = (SORTS[req.query.sort] || SORTS.end_date)(dir);
    const where = [];
    const params = [];
    if (req.query.state === "live") where.push("state <> 'cancelled'");
    else if (req.query.state === "down")
      where.push("account_down = 1 AND status = 'active'");
    else if (req.query.state) {
      where.push("state = ?");
      params.push(req.query.state);
    }
    if (req.query.product_id) {
      where.push("service_id = ?");
      params.push(Number(req.query.product_id));
    }
    if (req.query.batch_id) {
      where.push("batch_id = ?");
      params.push(Number(req.query.batch_id));
    }
    if (req.query.q) {
      where.push(
        "(customer_name LIKE ? OR account_email LIKE ? OR product_name LIKE ?)",
      );
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }
    const base = `FROM (${RENTAL_SELECT}) x ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total ${base}`,
      params,
    );
    const [data] = await pool.query(
      `SELECT * ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ data, total, page, limit });
  } catch (e) {
    next(e);
  }
});

router.post("/delete-many", async (req, res, next) => {
  try {
    const ids = cleanIds(req.body.ids);
    if (!ids.length)
      return res.status(400).json({ error: "No hay alquileres seleccionados" });
    const [r] = await pool.query(
      "DELETE FROM rentals WHERE id IN (?) AND status = 'cancelled'",
      [ids],
    );
    await dropLonelyBatches(pool);
    res.json({ deleted: r.affectedRows, skipped: ids.length - r.affectedRows });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      customer_id,
      product_id,
      quantity = 1,
      price = 0,
      end_date = null,
      days = 30,
      account_ids = null,
      as_batch = false,
    } = req.body;
    const picked = Array.isArray(account_ids)
      ? [
          ...new Set(
            account_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0),
          ),
        ]
      : null;
    const qty = picked ? picked.length : Math.floor(Number(quantity));

    if (!customer_id || !product_id)
      return res.status(400).json({ error: "Elige el cliente y el servicio" });
    if (!qty || qty < 1 || qty > 500)
      return res
        .status(400)
        .json({ error: "La cantidad debe estar entre 1 y 500" });

    await conn.beginTransaction();

    const [free] = picked
      ? await conn.query(
          `SELECT a.id FROM accounts a
           WHERE a.id IN (?) AND a.product_id = ? AND a.deleted_at IS NULL AND a.is_down = 0
             AND a.sale_mode = 'full'
             AND NOT EXISTS (SELECT 1 FROM rentals r WHERE r.account_id = a.id AND r.status = 'active')
           ORDER BY a.id FOR UPDATE`,
          [picked, product_id],
        )
      : await conn.query(
          `SELECT a.id FROM accounts a
           WHERE a.product_id = ? AND a.deleted_at IS NULL AND a.is_down = 0
             AND a.sale_mode = 'full'
             AND NOT EXISTS (SELECT 1 FROM rentals r WHERE r.account_id = a.id AND r.status = 'active')
           ORDER BY a.id LIMIT ? FOR UPDATE`,
          [product_id, qty],
        );

    if (free.length < qty) {
      await conn.rollback();
      return res.status(409).json({
        error: picked
          ? "Alguna de las cuentas elegidas ya no está libre. Actualiza la lista y vuelve a elegir."
          : `Solo hay ${free.length} ${free.length === 1 ? "cuenta libre" : "cuentas libres"} de este servicio y pediste ${qty}`,
      });
    }

    const [[d]] = await conn.query(
      "SELECT CURDATE() AS today, COALESCE(?, DATE_ADD(CURDATE(), INTERVAL ? DAY)) AS end_date",
      [end_date, Number(days) || 30],
    );
    const rows = free.map((a) => [
      customer_id,
      a.id,
      Number(price) || 0,
      d.today,
      d.end_date,
    ]);
    const [ins] = await conn.query(
      "INSERT INTO rentals (customer_id, account_id, price, start_date, end_date) VALUES ?",
      [rows],
    );

    await conn.query(
      `INSERT INTO payments (rental_id, customer_id, amount, paid_on, kind, payer_name, payer_phone, product_name, detail)
       SELECT rt.id, rt.customer_id, rt.price, rt.start_date, 'new', c.name, c.phone, p.name, a.email
       FROM rentals rt
       JOIN customers c ON c.id = rt.customer_id
       JOIN accounts a ON a.id = rt.account_id
       JOIN products p ON p.id = a.product_id
       WHERE rt.id BETWEEN ? AND ?`,
      [ins.insertId, ins.insertId + qty - 1],
    );

    let batchId = null;
    if (as_batch === true && qty >= 2) {
      const [[{ next }]] = await conn.query(
        "SELECT COALESCE(MAX(batch_id), 0) + 1 AS next FROM rentals",
      );
      await conn.query(
        "UPDATE rentals SET batch_id = ? WHERE id BETWEEN ? AND ?",
        [next, ins.insertId, ins.insertId + qty - 1],
      );
      batchId = next;
    }

    await conn.commit();
    res.status(201).json({ created: qty, batch_id: batchId });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post("/batch", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const ids = cleanIds(req.body.ids);
    if (ids.length < 2)
      return res
        .status(400)
        .json({ error: "Elige al menos 2 alquileres para formar un lote" });

    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT id, customer_id FROM rentals WHERE id IN (?) AND status = 'active' FOR UPDATE",
      [ids],
    );
    if (rows.length < 2) {
      await conn.rollback();
      return res.status(409).json({
        error: "Solo se pueden agrupar alquileres activos (elige al menos 2)",
      });
    }
    if (new Set(rows.map((r) => r.customer_id)).size > 1) {
      await conn.rollback();
      return res.status(409).json({
        error: "Un lote es de un solo cliente: elige alquileres del mismo cliente",
      });
    }
    const [[{ next }]] = await conn.query(
      "SELECT COALESCE(MAX(batch_id), 0) + 1 AS next FROM rentals",
    );
    await conn.query("UPDATE rentals SET batch_id = ? WHERE id IN (?)", [
      next,
      rows.map((r) => r.id),
    ]);
    await dropLonelyBatches(conn);
    await conn.commit();
    res.json({ batch_id: next, grouped: rows.length });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post("/unbatch", async (req, res, next) => {
  try {
    const ids = cleanIds(req.body.ids);
    const batchId = Number(req.body.batch_id);
    if (!ids.length && !(batchId > 0))
      return res.status(400).json({ error: "No hay nada seleccionado" });

    let ungrouped = 0;
    if (ids.length) {
      const [r] = await pool.query(
        "UPDATE rentals SET batch_id = NULL WHERE id IN (?) AND batch_id IS NOT NULL",
        [ids],
      );
      ungrouped += r.affectedRows;
    }
    if (batchId > 0) {
      const [r] = await pool.query(
        "UPDATE rentals SET batch_id = NULL WHERE batch_id = ?",
        [batchId],
      );
      ungrouped += r.affectedRows;
    }
    await dropLonelyBatches(pool);
    res.json({ ungrouped });
  } catch (e) {
    next(e);
  }
});

router.post("/renew", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { days = 30, end_date = null, amount = null, include_batch = false } = req.body;
    const ids = cleanIds(req.body.ids);
    if (!ids.length)
      return res.status(400).json({ error: "No hay alquileres seleccionados" });
    const paid = amount === null || amount === "" ? null : Number(amount);
    if (paid !== null && !(paid >= 0))
      return res.status(400).json({ error: "El valor cobrado no es válido" });

    await conn.beginTransaction();
    const target = include_batch === true ? await withBatch(conn, ids) : ids;
    if (!target.length) {
      await conn.rollback();
      return res.json({ renewed: 0 });
    }

    await conn.query(
      `INSERT INTO payments (rental_id, customer_id, amount, paid_on, kind, payer_name, payer_phone, product_name, detail)
       SELECT rt.id, rt.customer_id, COALESCE(?, rt.price), CURDATE(), 'renewal', c.name, c.phone, p.name, a.email
       FROM rentals rt
       JOIN customers c ON c.id = rt.customer_id
       JOIN accounts a ON a.id = rt.account_id
       JOIN products p ON p.id = a.product_id
       WHERE rt.id IN (?) AND rt.status = 'active'`,
      [paid, target],
    );
    const [r] = await conn.query(
      `UPDATE rentals
       SET end_date = COALESCE(?, DATE_ADD(GREATEST(end_date, CURDATE()), INTERVAL ? DAY))
       WHERE id IN (?) AND status = 'active'`,
      [end_date, Number(days) || 30, target],
    );
    await conn.commit();
    res.json({ renewed: r.affectedRows });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post("/cancel", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { account_action = "free", reason = "other", include_batch = false } = req.body;
    const ids = cleanIds(req.body.ids);
    if (!ids.length)
      return res.status(400).json({ error: "No hay alquileres seleccionados" });
    if (account_action === "trash" && !REASONS.includes(reason))
      return res.status(400).json({ error: "Motivo no válido" });

    await conn.beginTransaction();
    const target = include_batch === true ? await withBatch(conn, ids) : ids;
    const [rentals] = target.length
      ? await conn.query(
          "SELECT id, account_id FROM rentals WHERE id IN (?) AND status = 'active' FOR UPDATE",
          [target],
        )
      : [[]];
    if (!rentals.length) {
      await conn.rollback();
      return res
        .status(404)
        .json({ error: "Esos alquileres no existen o ya estaban cancelados" });
    }
    await conn.query(
      "UPDATE rentals SET status = 'cancelled' WHERE id IN (?)",
      [rentals.map((r) => r.id)],
    );

    const accountIds = rentals.map((r) => r.account_id);
    if (account_action === "trash")
      await conn.query(
        "UPDATE accounts SET deleted_at = NOW(), delete_reason = ? WHERE id IN (?) AND deleted_at IS NULL",
        [reason, accountIds],
      );
    else if (account_action === "down")
      await conn.query("UPDATE accounts SET is_down = 1 WHERE id IN (?)", [
        accountIds,
      ]);

    await conn.commit();
    res.json({ cancelled: rentals.length });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post("/:id/note", async (req, res, next) => {
  try {
    const note =
      String(req.body.notes ?? "")
        .trim()
        .slice(0, 255) || null;
    const [r] = await pool.query("UPDATE rentals SET notes = ? WHERE id = ?", [
      note,
      req.params.id,
    ]);
    if (!r.affectedRows)
      return res.status(404).json({ error: "Alquiler no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { price, end_date } = req.body;
    if (!end_date)
      return res
        .status(400)
        .json({ error: "La fecha de vencimiento es obligatoria" });
    const [r] = await pool.query(
      "UPDATE rentals SET price = ?, end_date = ? WHERE id = ?",
      [Number(price) || 0, end_date, req.params.id],
    );
    if (!r.affectedRows)
      return res.status(404).json({ error: "Alquiler no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;