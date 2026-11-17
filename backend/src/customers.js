import { Router } from 'express';
import { pool } from './db.js';

const INACTIVE_DAYS = 30;

const NORM = (col) => `REPLACE(REPLACE(REPLACE(${col}, '+', ''), ' ', ''), '-', '')`;
const SAME_PHONE = `(ps.buyer_phone IS NOT NULL
  AND CHAR_LENGTH(${NORM('c.phone')}) >= 7
  AND RIGHT(${NORM('ps.buyer_phone')}, 10) = RIGHT(${NORM('c.phone')}, 10))`;

const COVERAGE = `
  SELECT c.id, c.name, c.phone, c.email, c.notes,
    (SELECT COUNT(*) FROM rentals r
      WHERE r.customer_id = c.id AND r.status = 'active' AND r.end_date >= CURDATE()) AS rentals_active,
    (SELECT COUNT(*) FROM profile_sales ps
      WHERE ps.status = 'active' AND ps.end_date >= CURDATE() AND ${SAME_PHONE}) AS profiles_active,
    (SELECT MAX(r.end_date) FROM rentals r WHERE r.customer_id = c.id) AS rental_last,
    (SELECT MAX(ps.end_date) FROM profile_sales ps WHERE ${SAME_PHONE}) AS profile_last
  FROM customers c`;

const DERIVED = `
  SELECT t.*,
    (t.rentals_active + t.profiles_active) AS active_services,
    CASE WHEN t.rental_last IS NULL THEN t.profile_last
         WHEN t.profile_last IS NULL THEN t.rental_last
         ELSE GREATEST(t.rental_last, t.profile_last) END AS last_end
  FROM (${COVERAGE}) t`;

const FINAL = `
  SELECT d.*,
    CASE WHEN d.active_services > 0 THEN 0
         WHEN d.last_end IS NULL THEN NULL
         ELSE DATEDIFF(CURDATE(), d.last_end) END AS idle_days,
    CASE WHEN d.active_services > 0 THEN 0
         WHEN d.last_end IS NULL THEN 100000
         ELSE DATEDIFF(CURDATE(), d.last_end) END AS idle_sort,
    CASE WHEN d.active_services > 0 THEN 'active'
         WHEN d.last_end IS NULL THEN 'never'
         WHEN DATEDIFF(CURDATE(), d.last_end) >= ${INACTIVE_DAYS} THEN 'inactive'
         ELSE 'recent' END AS status
  FROM (${DERIVED}) d`;

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];

    const q = String(req.query.q || '').trim();
    if (q) {
      const like = `%${q}%`;
      where.push('(z.name LIKE ? OR z.phone LIKE ? OR z.email LIKE ?)');
      params.push(like, like, like);
    }
    if (['active', 'recent', 'inactive', 'never'].includes(req.query.status)) {
      where.push('z.status = ?');
      params.push(req.query.status);
    }
    const min = Math.floor(Number(req.query.min_days));
    if (min > 0) {
      where.push("z.status = 'inactive'");
      where.push('z.idle_days >= ?');
      params.push(min);
    }

    const [rows] = await pool.query(
      `SELECT z.* FROM (${FINAL}) z
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY z.id DESC LIMIT 1000`,
      params
    );
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;