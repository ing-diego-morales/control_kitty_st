import { Router } from 'express';
import { pool } from './db.js';

const NOTICE_UNION = `
  SELECT rt.id, 'full' AS kind, c.name AS customer_name, c.phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, '' AS profile_name,
         rt.end_date, DATEDIFF(rt.end_date, CURDATE()) AS days_left,
         (rt.notified_for IS NOT NULL AND rt.notified_for = rt.end_date) AS notified,
         CASE WHEN rt.notified_for = rt.end_date THEN rt.notified_at END AS notified_at
  FROM rentals rt
  JOIN customers c ON c.id = rt.customer_id
  JOIN accounts a ON a.id = rt.account_id
  JOIN products p ON p.id = a.product_id
  WHERE rt.status = 'active'
  UNION ALL
  SELECT ps.id, 'profile' AS kind, ps.buyer_name AS customer_name, ps.buyer_phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, ps.profile_name,
         ps.end_date, DATEDIFF(ps.end_date, CURDATE()) AS days_left,
         (ps.notified_for IS NOT NULL AND ps.notified_for = ps.end_date) AS notified,
         CASE WHEN ps.notified_for = ps.end_date THEN ps.notified_at END AS notified_at
  FROM profile_sales ps
  JOIN accounts a ON a.id = ps.account_id
  JOIN products p ON p.id = a.product_id
  WHERE ps.status = 'active'`;

const DOWN_UNION = `
  SELECT rt.id, 'full' AS kind, c.name AS customer_name, c.phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, '' AS profile_name,
         rt.end_date, DATEDIFF(rt.end_date, CURDATE()) AS days_left, a.down_since,
         (rt.down_notified_at IS NOT NULL
           AND rt.down_notified_at >= COALESCE(a.down_since, '1970-01-01')) AS notified,
         rt.down_notified_at AS notified_at
  FROM rentals rt
  JOIN customers c ON c.id = rt.customer_id
  JOIN accounts a ON a.id = rt.account_id
  JOIN products p ON p.id = a.product_id
  WHERE rt.status = 'active' AND a.is_down = 1 AND a.deleted_at IS NULL
  UNION ALL
  SELECT ps.id, 'profile' AS kind, ps.buyer_name AS customer_name, ps.buyer_phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, ps.profile_name,
         ps.end_date, DATEDIFF(ps.end_date, CURDATE()) AS days_left, a.down_since,
         (ps.down_notified_at IS NOT NULL
           AND ps.down_notified_at >= COALESCE(a.down_since, '1970-01-01')) AS notified,
         ps.down_notified_at AS notified_at
  FROM profile_sales ps
  JOIN accounts a ON a.id = ps.account_id
  JOIN products p ON p.id = a.product_id
  WHERE ps.status = 'active' AND a.is_down = 1 AND a.deleted_at IS NULL`;

const TABLES = { full: 'rentals', profile: 'profile_sales' };

function splitItems(items) {
  const ids = { full: [], profile: [] };
  for (const it of Array.isArray(items) ? items.slice(0, 500) : []) {
    const id = Number(it?.id);
    if ((it?.kind === 'full' || it?.kind === 'profile') && Number.isInteger(id) && id > 0)
      ids[it.kind].push(id);
  }
  return ids;
}

const router = Router();

router.get('/down', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (${DOWN_UNION}) x
       ORDER BY notified ASC, down_since DESC, customer_name ASC, id ASC
       LIMIT 300`
    );
    res.json({
      data: rows.map((r) => {
        const notified = Number(r.notified) === 1;
        return { ...r, notified, notified_at: notified ? r.notified_at : null };
      }),
    });
  } catch (e) { next(e); }
});

router.post('/down-mark', async (req, res, next) => {
  try {
    const ids = splitItems(req.body.items);
    const on = req.body.notified !== false;
    let updated = 0;
    for (const kind of ['full', 'profile']) {
      if (!ids[kind].length) continue;
      const [r] = await pool.query(
        `UPDATE ${TABLES[kind]} SET down_notified_at = ${on ? 'NOW()' : 'NULL'}
         WHERE id IN (?) AND status = 'active'`,
        [ids[kind]]
      );
      updated += r.affectedRows;
    }
    res.json({ updated });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) ? Math.min(30, Math.max(0, Math.floor(raw))) : 3;
    const where = ['days_left <= ?'];
    const params = [days];
    if (req.query.expired !== '1') where.push('days_left >= 0');

    const [rows] = await pool.query(
      `SELECT * FROM (${NOTICE_UNION}) x
       WHERE ${where.join(' AND ')}
       ORDER BY notified ASC, days_left ASC, customer_name ASC, id ASC
       LIMIT 500`,
      params
    );
    res.json({
      data: rows.map((r) => ({ ...r, notified: Number(r.notified) === 1 })),
    });
  } catch (e) { next(e); }
});

router.post('/mark', async (req, res, next) => {
  try {
    const ids = splitItems(req.body.items);
    const on = req.body.notified !== false;
    let updated = 0;
    for (const kind of ['full', 'profile']) {
      if (!ids[kind].length) continue;
      const table = TABLES[kind];
      const [r] = await pool.query(
        on
          ? `UPDATE ${table} SET notified_for = end_date, notified_at = NOW() WHERE id IN (?) AND status = 'active'`
          : `UPDATE ${table} SET notified_for = NULL, notified_at = NULL WHERE id IN (?)`,
        [ids[kind]]
      );
      updated += r.affectedRows;
    }
    res.json({ updated });
  } catch (e) { next(e); }
});

router.post('/:kind/:id', async (req, res, next) => {
  try {
    const table = TABLES[req.params.kind];
    if (!table) return res.status(400).json({ error: 'Tipo no válido' });
    const id = Number(req.params.id);

    const [[row]] = await pool.query(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    if (req.body.notified === false)
      await pool.query(`UPDATE ${table} SET notified_for = NULL, notified_at = NULL WHERE id = ?`, [id]);
    else
      await pool.query(`UPDATE ${table} SET notified_for = end_date, notified_at = NOW() WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;