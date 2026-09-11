import { pool } from '../config/db.js';
import { embed } from './llm.service.js';

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return 0;
  }

  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = Number(a[index]);
    const valueB = Number(b[index]);

    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      return 0;
    }

    dot += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  return magnitudeA && magnitudeB
    ? dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
    : 0;
}

function parseEmbedding(value) {
  // MySQL may already return JSON columns as arrays.
  if (Array.isArray(value)) {
    return value;
  }

  // Handle JSON stored/returned as a string.
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  // Handle Buffer values.
  if (Buffer.isBuffer(value)) {
    try {
      const parsed = JSON.parse(
        value.toString('utf8'),
      );

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export async function retrieveRelevant(
  userId,
  query,
  limit = 5,
) {
  // Convert the user's query into an embedding.
  const queryVector = await embed(query);

  // Get all chunks belonging to this user's documents.
  const [rows] = await pool.query(
    `SELECT dc.content, dc.embedding
     FROM document_chunks dc
     JOIN documents d
       ON d.id = dc.document_id
     WHERE d.user_id = ?`,
    [userId],
  );

  return rows
    .map((row) => {
      const embedding = parseEmbedding(
        row.embedding,
      );

      return {
        content: row.content,
        score: cosineSimilarity(
          queryVector,
          embedding,
        ),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((item) => item.score > 0.15);
}