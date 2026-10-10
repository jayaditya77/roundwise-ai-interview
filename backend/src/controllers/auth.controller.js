import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { sendAuthLink } from '../services/auth-email.service.js';

const verificationLifetimeMs = 24 * 60 * 60 * 1000;
const resetLifetimeMs = 30 * 60 * 1000;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function validToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
}

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      authVersion: Number(user.auth_version || 0),
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' },
  );
}

async function issueToken(table, userId, lifetimeMs) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + lifetimeMs);

  await pool.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  await pool.query(
    `INSERT INTO ${table} (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    [hashToken(token), userId, expiresAt],
  );
  return token;
}

async function sendVerification(user) {
  const token = await issueToken('email_verification_tokens', user.id, verificationLifetimeMs);
  await sendAuthLink({
    to: user.email,
    name: user.name,
    subject: 'Verify your Roundwise email',
    heading: 'Verify your email',
    message: 'Confirm your email address to finish creating your Roundwise account.',
    link: token,
    action: 'verify',
  });
}

async function sendReset(user) {
  const token = await issueToken('password_reset_tokens', user.id, resetLifetimeMs);
  await sendAuthLink({
    to: user.email,
    name: user.name,
    subject: 'Reset your Roundwise password',
    heading: 'Reset your password',
    message: 'Use this link to choose a new password. It expires in 30 minutes.',
    link: token,
    action: 'reset',
  });
}

export async function register(req, res) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!name || name.length > 100 || !email || email.length > 150 ||
        typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: 'Name, valid email, and a password between 8 and 128 characters are required.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, FALSE)',
      [name, email, passwordHash],
    );

    try {
      await sendVerification({ id: result.insertId, name, email });
    } catch (error) {
      console.error('Verification email delivery failed:', error.message);
      return res.status(503).json({
        message: 'Your account was created, but the verification email could not be sent. Please try resending it.',
      });
    }

    return res.status(201).json({
      message: 'Account created. Check your email for a verification link.',
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    return res.status(500).json({ message: 'Could not create your account.' });
  }
}

export async function verifyEmail(req, res) {
  const token = req.body.token;
  if (!validToken(token)) {
    return res.status(400).json({ message: 'Verification link is invalid or expired.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      `SELECT user_id FROM email_verification_tokens
       WHERE token_hash = ? AND expires_at > NOW() FOR UPDATE`,
      [hashToken(token)],
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Verification link is invalid or expired.' });
    }

    const userId = tokens[0].user_id;
    const [users] = await connection.query(
      'SELECT id, name, email, auth_version FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    if (!users.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Verification link is invalid or expired.' });
    }

    await connection.query('UPDATE users SET email_verified = TRUE WHERE id = ?', [userId]);
    await connection.query('DELETE FROM email_verification_tokens WHERE token_hash = ?', [hashToken(token)]);
    await connection.commit();
    return res.json({ token: sign(users[0]), user: users[0] });
  } catch (error) {
    await connection.rollback();
    console.error('Email verification failed:', error.message);
    return res.status(500).json({ message: 'Could not verify your email.' });
  } finally {
    connection.release();
  }
}

export async function resendVerification(req, res) {
  const email = normalizeEmail(req.body.email);
  const response = { message: 'If the account needs verification, a new link will be sent.' };
  if (!email) return res.json(response);

  try {
    const [users] = await pool.query(
      'SELECT id, name, email FROM users WHERE email = ? AND email_verified = FALSE LIMIT 1',
      [email],
    );
    if (users.length) await sendVerification(users[0]);
  } catch (error) {
    console.error('Verification resend failed:', error.message);
  }
  return res.json(response);
}

export async function login(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);

    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (!rows[0].email_verified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email before signing in.',
      });
    }

    const user = {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
      auth_version: rows[0].auth_version,
    };
    return res.json({ token: sign(user), user });
  } catch {
    return res.status(500).json({ message: 'Could not sign in.' });
  }
}

export async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body.email);
  const response = {
    message: 'If an account exists for that email, password reset instructions will be sent.',
  };

  if (email) {
    try {
      const [users] = await pool.query(
        'SELECT id, name, email FROM users WHERE email = ? AND email_verified = TRUE LIMIT 1',
        [email],
      );
      if (users.length) await sendReset(users[0]);
    } catch (error) {
      console.error('Password reset email delivery failed:', error.message);
    }
  }

  return res.json(response);
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!validToken(token) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Use a valid reset link and a password between 8 and 128 characters.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = ? AND expires_at > NOW() FOR UPDATE`,
      [hashToken(token)],
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Reset link is invalid or expired. Request a new one.' });
    }

    const userId = tokens[0].user_id;
    await connection.query(
      'UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
      [passwordHash, userId],
    );
    await connection.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
    await connection.commit();
    return res.json({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    await connection.rollback();
    console.error('Password reset failed:', error.message);
    return res.status(500).json({ message: 'Could not reset your password.' });
  } finally {
    connection.release();
  }
}

export async function getProfile(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, college, degree, graduation_year AS graduationYear,
              target_role AS targetRole, experience_level AS experienceLevel, location
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id],
    );
    if (!rows.length) return res.status(404).json({ message: 'Profile not found.' });
    return res.json(rows[0]);
  } catch (error) {
    console.error('Profile fetch failed:', error.message);
    return res.status(500).json({ message: 'Could not load your profile.' });
  }
}

export async function updateProfile(req, res) {
  const textFields = ['name', 'college', 'degree', 'targetRole', 'experienceLevel', 'location'];
  const values = {};
  for (const field of textFields) {
    const value = req.body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return res.status(400).json({ message: `Invalid ${field} value.` });
    }
    values[field] = typeof value === 'string' ? value.trim() || null : null;
  }

  if (!values.name || values.name.length > 100) {
    return res.status(400).json({ message: 'Name is required and must be at most 100 characters.' });
  }

  const fieldLimits = {
    college: 180,
    degree: 140,
    targetRole: 120,
    experienceLevel: 40,
    location: 120,
  };
  for (const [field, limit] of Object.entries(fieldLimits)) {
    if (values[field]?.length > limit) {
      return res.status(400).json({ message: `${field} must be at most ${limit} characters.` });
    }
  }

  let graduationYear = null;
  if (req.body.graduationYear !== undefined && req.body.graduationYear !== null && req.body.graduationYear !== '') {
    graduationYear = Number(req.body.graduationYear);
    if (!Number.isInteger(graduationYear) || graduationYear < 1950 || graduationYear > 2150) {
      return res.status(400).json({ message: 'Graduation year must be between 1950 and 2150.' });
    }
  }

  const experienceLevels = new Set(['Student', 'Entry-level', 'Early career', 'Mid-career', 'Senior']);
  if (values.experienceLevel && !experienceLevels.has(values.experienceLevel)) {
    return res.status(400).json({ message: 'Choose a valid experience level.' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE users
       SET name = ?, college = ?, degree = ?, graduation_year = ?,
           target_role = ?, experience_level = ?, location = ?
       WHERE id = ?`,
      [
        values.name,
        values.college,
        values.degree,
        graduationYear,
        values.targetRole,
        values.experienceLevel,
        values.location,
        req.user.id,
      ],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Profile not found.' });
    return getProfile(req, res);
  } catch (error) {
    console.error('Profile update failed:', error.message);
    return res.status(500).json({ message: 'Could not save your profile.' });
  }
}
