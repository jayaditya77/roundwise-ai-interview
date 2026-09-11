import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' },
  );
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({
        message: 'Name, email and a 6+ character password are required',
      });
    }

    const normalizedEmail = email.toLowerCase();
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail],
    );

    if (existing.length) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, normalizedEmail, passwordHash],
    );

    const user = {
      id: result.insertId,
      name,
      email: normalizedEmail,
    };

    return res.status(201).json({ token: sign(user), user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.toLowerCase();

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [normalizedEmail],
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password || '', rows[0].password_hash))
    ) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
    };

    return res.json({ token: sign(user), user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
