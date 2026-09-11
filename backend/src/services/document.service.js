import pdfParse from 'pdf-parse';
import { pool } from '../config/db.js';
import { embed } from './llm.service.js';

function chunkText(text, size = 1200, overlap = 180) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  const step = size - overlap;

  for (let index = 0; index < cleanText.length; index += step) {
    chunks.push(cleanText.slice(index, index + size));
  }

  return chunks.filter((chunk) => chunk.length > 40);
}

export async function ingestPdf(userId, file) {
  const parsed = await pdfParse(file.buffer);
  const chunks = chunkText(parsed.text);

  const [document] = await pool.query(
    'INSERT INTO documents (user_id, filename) VALUES (?, ?)',
    [userId, file.originalname],
  );

  for (let index = 0; index < chunks.length; index += 1) {
    const vector = await embed(chunks[index]);

    await pool.query(
      `INSERT INTO document_chunks
       (document_id, chunk_index, content, embedding)
       VALUES (?, ?, ?, ?)`,
      [document.insertId, index, chunks[index], JSON.stringify(vector)],
    );
  }

  return {
    id: document.insertId,
    filename: file.originalname,
    chunks: chunks.length,
  };
}
