import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { pool, initDatabase } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/document.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import resumeRoutes from './routes/resume.routes.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);

app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/mcp', mcpRoutes);

app.use((error, req, res, next) => {
  return res.status(500).json({
    message: error.message || 'Server error',
  });
});

app.listen(port, '0.0.0.0', async () => {
  console.log(`Roundwise backend running on port ${port}`);
  await initDatabase();
});