import 'dotenv/config';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('Falta JWT_SECRET en backend/.env');
  process.exit(1);
}

export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export const signToken = (u) =>
  jwt.sign({ id: u.id, ver: Number(u.token_version) || 0 }, SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '7d',
  });

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  }
  try {
    const [[u]] = await pool.query(
      'SELECT id, name, email, role, active, token_version FROM users WHERE id = ?',
      [payload.id]
    );
    if (!u || !u.active || (payload.ver ?? 0) !== u.token_version)
      return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
    req.user = publicUser(u);
    next();
  } catch (e) {
    next(e); 
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Solo un administrador puede hacer esto' });
  next();
}

const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of attempts) {
    const recent = list.filter((t) => now - t < WINDOW);
    if (recent.length) attempts.set(ip, recent);
    else attempts.delete(ip);
  }
}, WINDOW).unref();

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const now = Date.now();
    const recent = (attempts.get(req.ip) || []).filter((t) => now - t < WINDOW);
    if (recent.length >= 10)
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    attempts.set(req.ip, [...recent, now]);

    const { email = '', password = '' } = req.body;
    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
    const ok = user && (await bcrypt.compare(String(password), user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    if (!user.active)
      return res.status(403).json({ error: 'Tu usuario está desactivado. Habla con el administrador.' });

    attempts.delete(req.ip);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));