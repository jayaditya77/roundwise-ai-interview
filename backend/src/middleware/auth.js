import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  let user;
  try {
    user = jwt.verify(
      token,
      process.env.JWT_SECRET || 'dev-secret',
    );
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const [rows] = await pool.query('SELECT auth_version FROM users WHERE id = ? LIMIT 1', [user.id]);
    if (!rows.length || Number(user.authVersion || 0) !== Number(rows[0].auth_version || 0)) {
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(503).json({ message: 'Authentication service is temporarily unavailable.' });
  }
}
