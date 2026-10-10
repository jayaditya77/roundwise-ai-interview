import { pool } from '../config/db.js';
import { embed } from './llm.service.js';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'being', 'between', 'could', 'does',
  'from', 'have', 'into', 'more', 'most', 'other', 'should', 'some', 'than',
  'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
  'using', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would',
  'your', 'question', 'interview', 'role', 'technical', 'behavioral', 'engineer',
]);

const MIN_COSINE_SIMILARITY = 0.22;
const MIN_LEXICAL_OVERLAP = 0.2;

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

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .match(/[a-z0-9+#.]+/g)
      ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) || [],
  );
}

function lexicalOverlap(queryTokens, content) {
  if (!queryTokens.size) return 0;
  const contentTokens = tokenize(content);
  let matches = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}

export function rerankCandidates(rows, queryVector, query, limit = 5) {
  const queryTokens = tokenize(query);
  const candidateLimit = Math.max(limit * 6, 30);

  const vectorCandidates = rows
    .map((row) => ({
      content: row.content,
      score: cosineSimilarity(queryVector, parseEmbedding(row.embedding)),
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, candidateLimit);

  return vectorCandidates
    .map((candidate) => {
      const overlap = lexicalOverlap(queryTokens, candidate.content);
      return {
        ...candidate,
        relevanceScore: candidate.score * 0.8 + overlap * 0.2,
        lexicalOverlap: overlap,
      };
    })
    .filter((candidate) => (
      candidate.score >= MIN_COSINE_SIMILARITY ||
      candidate.lexicalOverlap >= MIN_LEXICAL_OVERLAP
    ))
    .sort((first, second) => second.relevanceScore - first.relevanceScore)
    .slice(0, limit)
    .map(({ content, score }) => ({ content, score }));
}

export async function retrieveRelevant(
  userId,
  query,
  limit = 5,
) {
  if (!query?.trim() || limit <= 0) return [];

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

  return rerankCandidates(rows, queryVector, query, limit);
}