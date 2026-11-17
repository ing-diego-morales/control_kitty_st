import { Router } from "express";
import { crudRouter } from "./crud.js";
import rentals from "./rentals.js";
import { pool } from "./db.js";
import { authRouter, requireAuth, requireAdmin } from './auth.js';
import { accountRouter, usersRouter } from './account.js';
import accounts from './accounts.js';
import profiles from './profiles.js';
import transactions from './transactions.js';
import customersList from './customers.js';
import notices from './notices.js';

const api = Router();

api.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});


api.use('/auth', authRouter);
api.use(requireAuth);

api.use('/account', accountRouter);
api.use('/users', requireAdmin, usersRouter);


api.get('/dashboard', async (req, res, next) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL) AS accounts,
        (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND is_down = 1) AS down_accounts,
        (SELECT COUNT(*) FROM rentals WHERE status = 'active' AND end_date >= CURDATE()) AS active_rentals,
        (SELECT COUNT(*) FROM rentals WHERE status = 'active' AND end_date < CURDATE()) AS expired,
        (SELECT COUNT(*) FROM rentals WHERE status = 'active'
           AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)) AS expiring,
        (SELECT COUNT(*) FROM profile_sales WHERE status = 'active' AND end_date < CURDATE()) AS p_expired,
        (SELECT COUNT(*) FROM profile_sales WHERE status = 'active'
           AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)) AS p_expiring,
        (SELECT COALESCE(SUM(price), 0) FROM rentals WHERE status = 'active') AS monthly_income`);

    const [[fp]] = await pool.query(`
      SELECT COALESCE(SUM(GREATEST(slots - used, 0)), 0) AS free_profiles FROM (
        SELECT a.profile_slots AS slots,
               (SELECT COUNT(*) FROM profile_sales ps WHERE ps.account_id = a.id AND ps.status = 'active') AS used
        FROM accounts a
        WHERE a.deleted_at IS NULL AND a.is_down = 0 AND a.sale_mode = 'profiles'
      ) x`);
    stats.free_profiles = Number(fp.free_profiles);

    const [free] = await pool.query(`
      SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
             p.id AS product_id, p.name AS product_name, COUNT(*) AS total
      FROM accounts a
      JOIN products p ON p.id = a.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE a.deleted_at IS NULL AND a.is_down = 0 AND a.sale_mode = 'full'
        AND NOT EXISTS (SELECT 1 FROM rentals r WHERE r.account_id = a.id AND r.status = 'active')
      GROUP BY c.name, p.id, p.name
      ORDER BY category_name, product_name`);

    const [rented] = await pool.query(`
      SELECT category_name, product_id, product_name,
             SUM(kind = 'full') AS total,
             SUM(kind = 'profile') AS profiles
      FROM (
        SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
               p.id AS product_id, p.name AS product_name, 'full' AS kind
        FROM rentals r
        JOIN accounts a ON a.id = r.account_id
        JOIN products p ON p.id = a.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE r.status = 'active' AND a.deleted_at IS NULL
        UNION ALL
        SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
               p.id AS product_id, p.name AS product_name, 'profile' AS kind
        FROM profile_sales ps
        JOIN accounts a ON a.id = ps.account_id
        JOIN products p ON p.id = a.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ps.status = 'active' AND a.deleted_at IS NULL
      ) x
      GROUP BY category_name, product_id, product_name
      ORDER BY category_name, product_name`);

    res.json({ stats, free, rented });
  } catch (e) { next(e); }
});

const DUE_UNION = `
  SELECT rt.id, 'full' AS kind, c.name AS customer_name, c.phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, '' AS profile_name,
         rt.end_date, DATEDIFF(rt.end_date, CURDATE()) AS days_left, rt.price
  FROM rentals rt
  JOIN customers c ON c.id = rt.customer_id
  JOIN accounts a ON a.id = rt.account_id
  JOIN products p ON p.id = a.product_id
  WHERE rt.status = 'active' AND rt.end_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
  UNION ALL
  SELECT ps.id, 'profile' AS kind, ps.buyer_name AS customer_name, ps.buyer_phone AS customer_phone,
         p.name AS product_name, a.email AS account_email, ps.profile_name,
         ps.end_date, DATEDIFF(ps.end_date, CURDATE()) AS days_left, ps.price
  FROM profile_sales ps
  JOIN accounts a ON a.id = ps.account_id
  JOIN products p ON p.id = a.product_id
  WHERE ps.status = 'active' AND ps.end_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;

api.get('/dashboard/due', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 8);
    const SCOPES = {
      expired: 'days_left < 0',
      soon: 'days_left BETWEEN 0 AND 3',
      week: 'days_left BETWEEN 4 AND 7',
    };
    const where = [];
    const params = [];
    if (['full', 'profile'].includes(req.query.kind)) { where.push('kind = ?'); params.push(req.query.kind); }
    if (SCOPES[req.query.scope]) where.push(SCOPES[req.query.scope]);
    if (req.query.q) {
      where.push('(customer_name LIKE ? OR product_name LIKE ? OR account_email LIKE ? OR profile_name LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like);
    }
    const base = `FROM (${DUE_UNION}) x ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, params);
    const [data] = await pool.query(
      `SELECT * ${base} ORDER BY days_left ASC, customer_name ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]);

    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(days_left < 0), 0) AS expired,
              COALESCE(SUM(days_left BETWEEN 0 AND 3), 0) AS soon,
              COALESCE(SUM(days_left BETWEEN 4 AND 7), 0) AS week,
              COALESCE(SUM(kind = 'full'), 0) AS completas,
              COALESCE(SUM(kind = 'profile'), 0) AS perfiles
       FROM (${DUE_UNION}) x`);

    res.json({ data, total, page, limit, counts });
  } catch (e) { next(e); }
});

api.get('/dashboard/customers', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.phone,
             COUNT(*) AS active_count,
             COALESCE(SUM(rt.price), 0) AS active_total,
             MIN(rt.end_date) AS next_end,
             (SELECT COUNT(*) FROM rentals x WHERE x.customer_id = c.id) AS lifetime
      FROM rentals rt
      JOIN customers c ON c.id = rt.customer_id
      WHERE rt.status = 'active'
      GROUP BY c.id, c.name, c.phone
      ORDER BY active_count DESC, lifetime DESC, active_total DESC
      LIMIT 10`);
    res.json(rows);
  } catch (e) { next(e); }
});

api.get('/dashboard/income', async (req, res, next) => {
  try {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const { from = '', to = '' } = req.query;
    if (!iso.test(from) || !iso.test(to) || from > to)
      return res.status(400).json({ error: 'El rango de fechas no es válido' });

    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total,
              COUNT(*) AS payments,
              COALESCE(SUM(kind = 'new'), 0) AS new_count,
              COALESCE(SUM(kind = 'renewal'), 0) AS renewal_count,
              COALESCE(SUM(CASE WHEN kind = 'new' THEN amount END), 0) AS new_total,
              COALESCE(SUM(CASE WHEN kind = 'renewal' THEN amount END), 0) AS renewal_total
       FROM payments WHERE paid_on BETWEEN ? AND ?`,
      [from, to]);
    res.json(row);
  } catch (e) { next(e); }
});

api.use("/rentals", rentals);
api.use('/transactions', transactions);
api.use('/notices', notices);
api.use('/profiles', profiles);

api.use(
  "/categories",
  crudRouter({
    table: "categories",
    fields: ["name"],
    searchFields: ["name"],
    required: ["name"],
  }),
);

api.use(
  "/products",
  crudRouter({
    table: "products",
    fields: ["category_id", "name", "price", "duration_days"],
    searchFields: ["products.name", "categories.name"],
    required: ["name"],
    select: `SELECT products.*, categories.name AS category_name
           FROM products LEFT JOIN categories ON categories.id = products.category_id`,
  }),
);

api.use('/accounts', accounts);

api.use('/customers', customersList);

api.use('/customers', crudRouter({
  table: 'customers',
  fields: ['name', 'phone', 'email', 'notes'],
  searchFields: ['name', 'phone', 'email'],
  required: ['name', 'phone', 'email'],
}));

export default api;