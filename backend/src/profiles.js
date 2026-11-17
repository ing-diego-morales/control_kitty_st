import { Router } from 'express';
import { pool } from './db.js';

export const PROFILE_SELECT = `
  SELECT ps.id, ps.account_id, ps.profile_name, ps.pin,
         ps.buyer_name AS customer_name, ps.buyer_phone AS customer_phone,
         ps.price, ps.start_date, ps.end_date, ps.status, ps.notes,
         a.email AS account_email, a.password AS account_password, a.is_down AS account_down,
         a.product_id AS service_id, p.name AS product_name,
         DATEDIFF(ps.end_date, CURDATE()) AS days_left,
         CASE
           WHEN ps.status = 'cancelled' THEN 'cancelled'
           WHEN ps.end_date < CURDATE() THEN 'expired'
           WHEN ps.end_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) THEN 'expiring'
           ELSE 'active'
         END AS state
  FROM profile_sales ps
  JOIN accounts a ON a.id = ps.account_id
  JOIN products p ON p.id = a.product_id`;

const SORTS = {
  customer: (d) => `customer_name ${d}, id ASC`,
  product: (d) => `product_name ${d}, account_email ${d}, profile_name ${d}`,
  profile: (d) => `profile_name ${d}, id ASC`,
  end_date: (d) => `end_date ${d}, id ASC`,
  state: (d) => `FIELD(state, 'expired', 'expiring', 'active', 'cancelled') ${d}, end_date ASC`,
  price: (d) => `price ${d}, id ASC`,
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, n) => String(v ?? '').trim().slice(0, n);
const phone = (v) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  return `+${d.length === 10 && d.startsWith('3') ? '57' : ''}${d}`;
};

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
    const orderBy = (SORTS[req.query.sort] || SORTS.end_date)(dir);
    const where = [];
    const params = [];
    if (req.query.state === 'live') where.push("state <> 'cancelled'");
    else if (req.query.state) { where.push('state = ?'); params.push(req.query.state); }
    if (req.query.product_id) { where.push('service_id = ?'); params.push(Number(req.query.product_id)); }
    if (req.query.q) {
      where.push('(customer_name LIKE ? OR account_email LIKE ? OR product_name LIKE ? OR profile_name LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like);
    }
    const base = `FROM (${PROFILE_SELECT}) x ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, params);
    const [data] = await pool.query(
      `SELECT * ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]);
    res.json({ data, total, page, limit });
  } catch (e) { next(e); }
});

router.get('/slots', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (
         SELECT a.id, a.email, a.profile_slots,
                (SELECT COUNT(*) FROM profile_sales ps WHERE ps.account_id = a.id AND ps.status = 'active') AS used
         FROM accounts a
         WHERE a.product_id = ? AND a.deleted_at IS NULL AND a.is_down = 0 AND a.sale_mode = 'profiles'
       ) x WHERE used < profile_slots ORDER BY id`,
      [Number(req.query.product_id) || 0]);
    res.json(rows.map((r) => ({ ...r, free: r.profile_slots - Number(r.used) })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { account_id, price = 0, end_date = '' } = req.body;
    const profile_name = clean(req.body.profile_name, 60);
    const pin = clean(req.body.pin, 20) || null;
    const buyer_name = clean(req.body.buyer_name, 120);
    const buyer_phone = phone(req.body.buyer_phone);
    const amount = Number(price) || 0;

    if (!account_id) return res.status(400).json({ error: 'Elige la cuenta' });
    if (!buyer_name) return res.status(400).json({ error: 'Escribe el nombre de quien compra' });
    if (!ISO.test(end_date)) return res.status(400).json({ error: 'Indica la fecha de corte' });
    if (amount < 0) return res.status(400).json({ error: 'El precio no es válido' });

    await conn.beginTransaction();

    const [[acc]] = await conn.query(
      `SELECT a.id, a.profile_slots, a.email,
              (SELECT name FROM products WHERE id = a.product_id) AS product_name
       FROM accounts a
       WHERE a.id = ? AND a.deleted_at IS NULL AND a.is_down = 0 AND a.sale_mode = 'profiles' FOR UPDATE`,
      [account_id]);
    if (!acc) {
      await conn.rollback();
      return res.status(409).json({ error: 'Esa cuenta no está disponible para vender por perfiles' });
    }
    const [[{ used }]] = await conn.query(
      "SELECT COUNT(*) AS used FROM profile_sales WHERE account_id = ? AND status = 'active'", [acc.id]);
    if (Number(used) >= acc.profile_slots) {
      await conn.rollback();
      return res.status(409).json({ error: 'Esa cuenta ya tiene todos sus perfiles vendidos' });
    }

    const [ins] = await conn.query(
      `INSERT INTO profile_sales (account_id, profile_name, pin, buyer_name, buyer_phone, price, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
      [acc.id, profile_name, pin, buyer_name, buyer_phone, amount, end_date]);
    await conn.query(
      `INSERT INTO payments (profile_sale_id, amount, paid_on, kind, payer_name, payer_phone, product_name, detail)
       VALUES (?, ?, CURDATE(), 'new', ?, ?, ?, ?)`,
      [ins.insertId, amount, buyer_name, buyer_phone, acc.product_name,
       [acc.email, profile_name].filter(Boolean).join(' · ')]);

    await conn.commit();
    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post('/renew', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { ids = [], days = 30, end_date = null, amount = null } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ error: 'No hay perfiles seleccionados' });
    if (end_date !== null && !ISO.test(end_date))
      return res.status(400).json({ error: 'La fecha no es válida' });
    const paid = amount === null || amount === '' ? null : Number(amount);
    if (paid !== null && !(paid >= 0))
      return res.status(400).json({ error: 'El valor cobrado no es válido' });

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO payments (profile_sale_id, amount, paid_on, kind, payer_name, payer_phone, product_name, detail)
       SELECT ps.id, COALESCE(?, ps.price), CURDATE(), 'renewal', ps.buyer_name, ps.buyer_phone, p.name,
              CONCAT(a.email, IF(ps.profile_name <> '', CONCAT(' · ', ps.profile_name), ''))
       FROM profile_sales ps
       JOIN accounts a ON a.id = ps.account_id
       JOIN products p ON p.id = a.product_id
       WHERE ps.id IN (?) AND ps.status = 'active'`,
      [paid, ids]);
    const [r] = await conn.query(
      `UPDATE profile_sales
       SET end_date = COALESCE(?, DATE_ADD(GREATEST(end_date, CURDATE()), INTERVAL ? DAY))
       WHERE id IN (?) AND status = 'active'`,
      [end_date, Number(days) || 30, ids]);
    await conn.commit();
    res.json({ renewed: r.affectedRows });
  } catch (e) {
    await conn.rollback().catch(() => {});
    next(e);
  } finally {
    conn.release();
  }
});

router.post('/cancel', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n) => n > 0) : [];
    if (!ids.length) return res.status(400).json({ error: 'No hay perfiles seleccionados' });
    const [r] = await pool.query(
      "UPDATE profile_sales SET status = 'cancelled' WHERE id IN (?) AND status = 'active'", [ids]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Esos perfiles no existen o ya estaban cortados' });
    res.json({ cancelled: r.affectedRows });
  } catch (e) { next(e); }
});

router.post('/delete-many', async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [])
      .slice(0, 500).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return res.status(400).json({ error: 'No hay perfiles seleccionados' });
    const [r] = await pool.query("DELETE FROM profile_sales WHERE id IN (?) AND status = 'cancelled'", [ids]);
    res.json({ deleted: r.affectedRows, skipped: ids.length - r.affectedRows });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const buyer_name = clean(req.body.buyer_name, 120);
    const end_date = req.body.end_date;
    if (!buyer_name) return res.status(400).json({ error: 'Escribe el nombre de quien compra' });
    if (!ISO.test(end_date || '')) return res.status(400).json({ error: 'Indica la fecha de corte' });
    const [r] = await pool.query(
      `UPDATE profile_sales
       SET profile_name = ?, pin = ?, buyer_name = ?, buyer_phone = ?, price = ?, end_date = ?, notes = ?
       WHERE id = ? AND status = 'active'`,
      [clean(req.body.profile_name, 60), clean(req.body.pin, 20) || null, buyer_name,
       phone(req.body.buyer_phone), Number(req.body.price) || 0, end_date,
       clean(req.body.notes, 255) || null, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;