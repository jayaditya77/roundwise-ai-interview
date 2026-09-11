import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || 'dev-secret',
    );
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
