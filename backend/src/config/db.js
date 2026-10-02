import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'roundwise',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: process.env.DB_SSL === 'true'
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      }
    : undefined,
});

export async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        role VARCHAR(100) NOT NULL,
        topic VARCHAR(100) NOT NULL,
        difficulty ENUM('Easy', 'Medium', 'Hard') DEFAULT 'Medium',
        interview_type ENUM('Technical', 'HR', 'Mixed') DEFAULT 'Technical',
        duration_minutes INT DEFAULT 15,
        total_questions INT DEFAULT 5,
        current_question_index INT DEFAULT 0,
        status ENUM('in_progress', 'completed', 'abandoned') DEFAULT 'in_progress',
        overall_score DECIMAL(5, 2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluation_results (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id INT NOT NULL UNIQUE,
        overall_score DECIMAL(5, 2) NOT NULL,
        technical_score DECIMAL(5, 2) NULL,
        communication_score DECIMAL(5, 2) NULL,
        summary TEXT NOT NULL,
        strengths JSON NULL,
        areas_for_improvement JSON NULL,
        recommendation VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [qCols] = await pool.query('DESCRIBE questions');
    const qColNames = qCols.map((c) => c.Field);
    if (!qColNames.includes('session_id')) {
      await pool.query('ALTER TABLE questions ADD COLUMN session_id INT NULL');
      await pool.query('ALTER TABLE questions ADD CONSTRAINT fk_questions_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE');
    }
    if (!qColNames.includes('question_order')) {
      await pool.query('ALTER TABLE questions ADD COLUMN question_order INT DEFAULT 1');
    }
    if (qCols.find((c) => c.Field === 'interview_id')?.Null === 'NO') {
      await pool.query('ALTER TABLE questions MODIFY COLUMN interview_id INT NULL');
    }

    const [aCols] = await pool.query('DESCRIBE answers');
    const aColNames = aCols.map((c) => c.Field);
    if (!aColNames.includes('session_id')) {
      await pool.query('ALTER TABLE answers ADD COLUMN session_id INT NULL');
      await pool.query('ALTER TABLE answers ADD CONSTRAINT fk_answers_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE');
    }
    if (!aColNames.includes('ideal_answer')) {
      await pool.query('ALTER TABLE answers ADD COLUMN ideal_answer TEXT NULL');
    }
  } catch (err) {
    console.warn('Database auto-migration note:', err.message);
  }
}