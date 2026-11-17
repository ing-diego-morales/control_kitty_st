import { Router } from 'express';
import { pool } from './db.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_DIGITS = `REPLACE(REPLACE(REPLACE(p.payer_phone, '+', ''), ' ', ''), '-', '')`;

const SORTS = {
  date: (d) => `p.paid_on ${d}, p.id ${d}`,
  customer: (d) => `p.payer_name ${d}, p.paid_on DESC`,
  product: (d) => `p.product_name ${d}, p.paid_on DESC`,
  kind: (d) => `p.kind ${d}, p.paid_on DESC`,
  amount: (d) => `p.amount ${d}, p.id DESC`,
};

async function buildWhere(q) {
  const where = [];
  const params = [];
  if (ISO.test(q.from || '')) { where.push('p.paid_on >= ?'); params.push(q.from); }
  if (ISO.test(q.to || '')) { where.push('p.paid_on <= ?'); params.push(q.to); }
  if (['new', 'renewal'].includes(q.kind)) { where.push('p.kind = ?'); params.push(q.kind); }
  if (q.type === 'full') where.push('p.profile_sale_id IS NULL');
  if (q.type === 'profile') where.push('p.profile_sale_id IS NOT NULL');
  if (q.q) {
    const like = `%${q.q}%`;
    where.push('(p.payer_name LIKE ? OR p.product_name LIKE ? OR p.detail LIKE ? OR p.payer_phone LIKE ?)');
    params.push(like, like, like, like);
  }
  if (q.customer_id) {
    const id = Number(q.customer_id);
    const [[c]] = await pool.query('SELECT phone FROM customers WHERE id = ?', [id]);
    const digits = String(c?.phone || '').replace(/\D/g, '');
    if (digits.length >= 7) {
      where.push(`(p.customer_id = ? OR RIGHT(${PHONE_DIGITS}, 10) = ?)`);
      params.push(id, digits.slice(-10));
    } else {
      where.push('p.customer_id = ?');
      params.push(id);
    }
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const orderBy = (SORTS[req.query.sort] || SORTS.date)(dir);
    const { sql, params } = await buildWhere(req.query);

    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(p.amount), 0) AS total,
              COALESCE(SUM(CASE WHEN p.kind = 'new' THEN p.amount END), 0) AS new_total,
              COALESCE(SUM(CASE WHEN p.kind = 'new' THEN 1 ELSE 0 END), 0) AS new_count,
              COALESCE(SUM(CASE WHEN p.kind = 'renewal' THEN p.amount END), 0) AS renewal_total,
              COALESCE(SUM(CASE WHEN p.kind = 'renewal' THEN 1 ELSE 0 END), 0) AS renewal_count,
              COALESCE(SUM(CASE WHEN p.profile_sale_id IS NULL THEN p.amount END), 0) AS full_total,
              COALESCE(SUM(CASE WHEN p.profile_sale_id IS NOT NULL THEN p.amount END), 0) AS profile_total,
              MIN(p.paid_on) AS first_on, MAX(p.paid_on) AS last_on
       FROM payments p ${sql}`,
      params);

    const [data] = await pool.query(
      `SELECT p.id, p.paid_on, p.amount, p.kind,
              COALESCE(p.payer_name, 'Sin datos') AS customer_name, p.payer_phone AS customer_phone,
              p.product_name, p.detail,
              CASE WHEN p.profile_sale_id IS NOT NULL THEN 'profile' ELSE 'full' END AS type
       FROM payments p ${sql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]);

    res.json({ data, total: Number(summary.n), summary, page, limit });
  } catch (e) { next(e); }
});

export default router;