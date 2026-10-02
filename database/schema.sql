CREATE DATABASE IF NOT EXISTS roundwise;

USE roundwise;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id),
  INDEX (status)
);

CREATE TABLE IF NOT EXISTS interviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  role VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  difficulty ENUM('Easy', 'Medium', 'Hard') DEFAULT 'Medium',
  score DECIMAL(5, 2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NULL,
  interview_id INT NULL,
  question_order INT DEFAULT 1,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) DEFAULT 'technical',
  expected_points JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
  INDEX (session_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NULL,
  question_id INT NOT NULL,
  user_answer TEXT NOT NULL,
  score DECIMAL(5, 2) DEFAULT NULL,
  strengths JSON NULL,
  weaknesses JSON NULL,
  feedback TEXT NULL,
  ideal_answer TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  INDEX (session_id)
);

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
);

CREATE TABLE IF NOT EXISTS documents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  document_id INT NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  INDEX (document_id)
);
