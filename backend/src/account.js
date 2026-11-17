import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { signToken, publicUser } from './auth.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'staff'];
const clean = (v, n) => String(v ?? '').trim().slice(0, n);

function checkPassword(p) {
  const s = String(p ?? '');
  if (s.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (s.length > 72) return 'La contraseña no puede pasar de 72 caracteres';
  return null;
}

const tries = new Map();
const WINDOW = 15 * 60 * 1000;
function tooMany(id) {
  const now = Date.now();
  const recent = (tries.get(id) || []).filter((t) => now - t < WINDOW);
  tries.set(id, recent);
  return recent.length >= 5;
}
const failed = (id) => tries.set(id, [...(tries.get(id) || []), Date.now()]);

async function currentPasswordOk(req, res) {
  if (tooMany(req.user.id)) {
    res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    return false;
  }
  const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const ok = !!u && (await bcrypt.compare(String(req.body.current_password ?? ''), u.password_hash));
  if (!ok) {
    failed(req.user.id);
    res.status(400).json({ error: 'La contraseña actual no es correcta' });
    return false;
  }
  tries.delete(req.user.id);
  return true;
}

async function freshSession(id) {
  const [[u]] = await pool.query('SELECT id, name, email, role, token_version FROM users WHERE id = ?', [id]);
  return { token: signToken(u), user: publicUser(u) };
}

export const accountRouter = Router();

accountRouter.get('/', (req, res) => res.json({ user: req.user }));

accountRouter.put('/profile', async (req, res, next) => {
  try {
    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 120).toLowerCase();
    if (!name) return res.status(400).json({ error: 'Escribe tu nombre' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'El correo no es válido' });

    if (email !== req.user.email) {
      if (!(await currentPasswordOk(req, res))) return;
      const [[dup]] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id]);
      if (dup) return res.status(409).json({ error: 'Ese correo ya lo usa otro usuario' });
    }
    await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.user.id]);
    res.json(await freshSession(req.user.id));
  } catch (e) { next(e); }
});

accountRouter.put('/password', async (req, res, next) => {
  try {
    const bad = checkPassword(req.body.new_password);
    if (bad) return res.status(400).json({ error: bad });
    if (!(await currentPasswordOk(req, res))) return;
    if (req.body.new_password === req.body.current_password)
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });

    const hash = await bcrypt.hash(String(req.body.new_password), 10);
    await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
    res.json(await freshSession(req.user.id));
  } catch (e) { next(e); }
});

export const usersRouter = Router();

async function otherAdmins(excludeId) {
  const [[r]] = await pool.query(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [excludeId]);
  return Number(r.n);
}

usersRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, active FROM users ORDER BY role ASC, name ASC');
    res.json(rows);
  } catch (e) { next(e); }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 120).toLowerCase();
    const role = ROLES.includes(req.body.role) ? req.body.role : 'staff';
    if (!name) return res.status(400).json({ error: 'Escribe el nombre' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'El correo no es válido' });
    const bad = checkPassword(req.body.password);
    if (bad) return res.status(400).json({ error: bad });

    const [[dup]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dup) return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });

    const hash = await bcrypt.hash(String(req.body.password), 10);
    const [r] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]);
    res.status(201).json({ id: r.insertId });
  } catch (e) { next(e); }
});

usersRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[t]] = await pool.query('SELECT id, role, active FROM users WHERE id = ?', [id]);
    if (!t) return res.status(404).json({ error: 'Usuario no encontrado' });

    const name = clean(req.body.name, 80);
    const role = req.body.role === undefined ? t.role : req.body.role;
    const active = req.body.active === undefined ? t.active : req.body.active ? 1 : 0;
    if (!name) return res.status(400).json({ error: 'Escribe el nombre' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' });

    if (id === req.user.id && role !== 'admin')
      return res.status(400).json({ error: 'No puedes quitarte el rol de administrador a ti mismo' });
    if (id === req.user.id && !active)
      return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });

    const losesAdmin = t.role === 'admin' && t.active && (role !== 'admin' || !active);
    if (losesAdmin && (await otherAdmins(id)) === 0)
      return res.status(409).json({ error: 'Debe quedar al menos un administrador activo' });

    await pool.query('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [name, role, active, id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

usersRouter.post('/:id/password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id)
      return res.status(400).json({ error: 'Tu propia contraseña se cambia en la sección "Contraseña"' });
    const bad = checkPassword(req.body.new_password);
    if (bad) return res.status(400).json({ error: bad });

    const hash = await bcrypt.hash(String(req.body.new_password), 10);
    const [r] = await pool.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    const [[t]] = await pool.query('SELECT role, active FROM users WHERE id = ?', [id]);
    if (!t) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (t.role === 'admin' && t.active && (await otherAdmins(id)) === 0)
      return res.status(409).json({ error: 'Debe quedar al menos un administrador activo' });
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.status(204).end();
  } catch (e) { next(e); }
});