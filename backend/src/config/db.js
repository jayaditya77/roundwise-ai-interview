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
    const [userCols] = await pool.query('DESCRIBE users');
    const userColNames = userCols.map((column) => column.Field);
    if (!userColNames.includes('email_verified')) {
      await pool.query('ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE');
    }
    if (!userColNames.includes('auth_version')) {
      await pool.query('ALTER TABLE users ADD COLUMN auth_version INT NOT NULL DEFAULT 0');
    }
    const profileColumns = [
      ['college', 'VARCHAR(180) NULL'],
      ['degree', 'VARCHAR(140) NULL'],
      ['graduation_year', 'SMALLINT NULL'],
      ['target_role', 'VARCHAR(120) NULL'],
      ['experience_level', 'VARCHAR(40) NULL'],
      ['location', 'VARCHAR(120) NULL'],
    ];
    for (const [column, definition] of profileColumns) {
      if (!userColNames.includes(column)) {
        await pool.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

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

    // Resume table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_resumes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL UNIQUE,
        filename VARCHAR(255) NOT NULL,
        raw_text MEDIUMTEXT,
        name VARCHAR(200),
        skills JSON,
        projects JSON,
        experience JSON,
        education JSON,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migrate: add individual columns if table was created with old 'profile' blob schema
    const [resumeCols] = await pool.query('DESCRIBE candidate_resumes');
    const resumeColNames = resumeCols.map((c) => c.Field);
    if (!resumeColNames.includes('name')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN name VARCHAR(200) NULL');
    }
    if (!resumeColNames.includes('skills')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN skills JSON NULL');
    }
    if (!resumeColNames.includes('projects')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN projects JSON NULL');
    }
    if (!resumeColNames.includes('experience')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN experience JSON NULL');
    }
    if (!resumeColNames.includes('education')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN education JSON NULL');
    }
    if (!resumeColNames.includes('summary')) {
      await pool.query('ALTER TABLE candidate_resumes ADD COLUMN summary TEXT NULL');
    }

  } catch (err) {
    console.warn('Database auto-migration note:', err.message);
  }
}