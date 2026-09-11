import { pool } from '../config/db.js';
import { ingestPdf } from '../services/document.service.js';
import { retrieveRelevant } from '../services/rag.service.js';

export async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'PDF file required' });
    }

    const document = await ingestPdf(req.user.id, req.file);
    return res.status(201).json(document);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function list(req, res) {
  const [rows] = await pool.query(
    'SELECT id, filename, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
  );

  return res.json(rows);
}

export async function search(req, res) {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Query required' });
    }

    return res.json(await retrieveRelevant(req.user.id, query, 5));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
