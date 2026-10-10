import pdfParse from 'pdf-parse';
import { pool } from '../config/db.js';
import { extractResume } from '../services/llm.service.js';

// =========================================================
// Upload + Parse Resume
// =========================================================

export async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'PDF file required' });
    }

    const parsed = await pdfParse(req.file.buffer);
    const rawText = parsed.text?.replace(/\s+/g, ' ').trim() || '';

    if (!rawText || rawText.length < 50) {
      return res.status(400).json({ message: 'Could not extract text from PDF. Please try a text-based PDF.' });
    }

    // Call AI service to extract structured profile
    const profile = await extractResume(rawText);

    // Upsert: each user has one active resume (replace old one)
    await pool.query(
      `DELETE FROM candidate_resumes WHERE user_id = ?`,
      [req.user.id],
    );

    const [result] = await pool.query(
      `INSERT INTO candidate_resumes
       (user_id, filename, raw_text, name, skills, projects, experience, education, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.file.originalname,
        rawText.slice(0, 20000), // cap to 20k chars
        profile.name || 'Candidate',
        JSON.stringify(profile.skills || []),
        JSON.stringify(profile.projects || []),
        JSON.stringify(profile.experience || []),
        JSON.stringify(profile.education || []),
        profile.summary || '',
      ],
    );

    return res.status(201).json({
      id: result.insertId,
      filename: req.file.originalname,
      name: profile.name,
      skills: profile.skills,
      projects: profile.projects,
      experience: profile.experience,
      education: profile.education,
      summary: profile.summary,
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    return res.status(500).json({ message: error.message || 'Resume processing failed' });
  }
}

// =========================================================
// Get Current Resume Profile
// =========================================================

export async function getResume(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, filename, name, skills, projects, experience, education, summary, created_at
       FROM candidate_resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.json(null);
    }

    const row = rows[0];

    function parseField(val, fallback = []) {
      if (!val) return fallback;
      if (Array.isArray(val) || typeof val === 'object') return val;
      try {
        return JSON.parse(Buffer.isBuffer(val) ? val.toString('utf8') : val);
      } catch {
        return fallback;
      }
    }

    return res.json({
      id: row.id,
      filename: row.filename,
      name: row.name,
      skills: parseField(row.skills),
      projects: parseField(row.projects),
      experience: parseField(row.experience),
      education: parseField(row.education),
      summary: row.summary,
      createdAt: row.created_at,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
