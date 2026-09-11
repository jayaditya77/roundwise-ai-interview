import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { authApi, documentApi, interviewApi } from './services/api';
import './styles.css';

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const response =
        mode === 'login'
          ? await authApi.login(form)
          : await authApi.register(form);

      localStorage.setItem('roundwise_token', response.data.token);
      localStorage.setItem('roundwise_user', JSON.stringify(response.data.user));
      onLogin(response.data.user);
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Request failed');
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const isLogin = mode === 'login';

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          Round<span>wise</span>
        </div>

        <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">AI-powered technical interview practice.</p>

        <form onSubmit={submit}>
          {!isLogin && (
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              required
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            required
          />

          {error && <div className="error">{error}</div>}

          <button className="primary" type="submit">
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <button
          className="link"
          type="button"
          onClick={() => setMode(isLogin ? 'register' : 'login')}
        >
          {isLogin ? 'Create an account' : 'Already have an account?'}
        </button>
      </div>
    </div>
  );
}

function App({ user, onLogout }) {
  const [tab, setTab] = useState('practice');
  const [role, setRole] = useState('Software Engineer');
  const [topic, setTopic] = useState('DBMS');
  const [difficulty, setDifficulty] = useState('Medium');
  const [rag, setRag] = useState(true);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');

  async function loadData() {
    try {
      const [historyResponse, documentsResponse] = await Promise.all([
        interviewApi.history(),
        documentApi.list(),
      ]);

      setHistory(historyResponse.data);
      setDocuments(documentsResponse.data);
    } catch {
      // The API may be unavailable while the frontend is being previewed.
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function startInterview() {
    setLoading(true);
    setResult(null);
    setAnswer('');

    try {
      const response = await interviewApi.create({
        role,
        topic,
        difficulty,
        useRag: rag,
      });

      setQuestion(response.data);
    } catch (requestError) {
      setMessage(
        requestError.response?.data?.message || 'Could not generate question',
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    setLoading(true);

    try {
      const response = await interviewApi.answer({
        questionId: question.questionId,
        answer,
      });

      setResult(response.data);
      await loadData();
    } catch (requestError) {
      setMessage(
        requestError.response?.data?.message || 'Could not evaluate answer',
      );
    } finally {
      setLoading(false);
    }
  }

  async function uploadDocument() {
    if (!file) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await documentApi.upload(formData);
      setMessage(
        `Uploaded ${response.data.filename} (${response.data.chunks} chunks)`,
      );
      setFile(null);
      await loadData();
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  const pageCopy = {
    practice: {
      title: 'Interview Practice',
      description: 'Practice technical interviews and get structured feedback.',
    },
    knowledge: {
      title: 'Knowledge Base',
      description: 'Add study material to ground questions with retrieval.',
    },
    history: {
      title: 'Interview History',
      description: 'Review your previous interview sessions and scores.',
    },
  };

  const currentPage = pageCopy[tab];

  function logout() {
    localStorage.removeItem('roundwise_token');
    localStorage.removeItem('roundwise_user');
    onLogout();
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          Round<span>wise</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {[
            ['practice', 'Interview'],
            ['knowledge', 'Knowledge Base'],
            ['history', 'History'],
          ].map(([id, label]) => (
            <button
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
              key={id}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="userbox">
          <b>{user.name}</b>
          <span>{user.email}</span>
          <button onClick={logout} type="button">
            Logout
          </button>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <h1>{currentPage.title}</h1>
            <p className="muted">{currentPage.description}</p>
          </div>
        </header>

        {message && (
          <button
            className="notice"
            onClick={() => setMessage('')}
            type="button"
            aria-label="Dismiss notification"
          >
            {message}
          </button>
        )}

        {tab === 'practice' && (
          <section>
            <div className="form-grid">
              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option>Software Engineer</option>
                  <option>Backend Developer</option>
                  <option>Data Analyst</option>
                  <option>Full Stack Developer</option>
                </select>
              </label>

              <label>
                Topic
                <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                  <option>DSA</option>
                  <option>DBMS</option>
                  <option>OOP</option>
                  <option>Operating Systems</option>
                  <option>System Design</option>
                </select>
              </label>

              <label>
                Difficulty
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={rag}
                  onChange={(event) => setRag(event.target.checked)}
                />
                Use my uploaded knowledge (RAG)
              </label>
            </div>

            <button
              className="primary start"
              onClick={startInterview}
              disabled={loading}
              type="button"
            >
              {loading ? 'Generating...' : 'Generate Interview Question'}
            </button>

            {question && (
              <div className="card question">
                <span className="badge">
                  {question.usedRag ? 'RAG grounded' : 'General knowledge'}
                </span>

                <h2>{question.question}</h2>

                <textarea
                  rows="8"
                  placeholder="Write your answer as if you were speaking to an interviewer..."
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                />

                <button
                  className="primary"
                  disabled={!answer.trim() || loading}
                  onClick={submitAnswer}
                  type="button"
                >
                  {loading ? 'Evaluating...' : 'Submit Answer'}
                </button>

                {result && (
                  <div className="result">
                    <div className="score">
                      {result.score}
                      <small>/10</small>
                    </div>

                    <div>
                      <h3>AI Feedback</h3>
                      <p>{result.feedback}</p>

                      <div className="cols">
                        <div>
                          <b>Strengths</b>
                          <ul>
                            {result.strengths?.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <b>Improve</b>
                          <ul>
                            {result.weaknesses?.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <details>
                        <summary>Ideal answer</summary>
                        <p>{result.ideal_answer}</p>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'knowledge' && (
          <section>
            <div className="card upload">
              <h2>Upload study material</h2>
              <p className="muted">
                PDFs are chunked, embedded, and stored in MySQL for retrieval.
              </p>

              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />

              <button
                className="primary"
                disabled={!file || loading}
                onClick={uploadDocument}
                type="button"
              >
                {loading ? 'Processing...' : 'Upload PDF'}
              </button>
            </div>

            <div className="card">
              <h2>Your documents</h2>

              {documents.length ? (
                <ul className="docs">
                  {documents.map((document) => (
                    <li key={document.id}>
                      <span>{document.filename}</span>
                      <small>{new Date(document.created_at).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No documents uploaded yet.</p>
              )}
            </div>
          </section>
        )}

        {tab === 'history' && (
          <section>
            <div className="card">
              <h2>Past interviews</h2>

              {history.length ? (
                <div className="table">
                  <div className="tr th">
                    <span>Role</span>
                    <span>Topic</span>
                    <span>Difficulty</span>
                    <span>Score</span>
                    <span>Date</span>
                  </div>

                  {history.map((item) => (
                    <div className="tr" key={item.id}>
                      <span>{item.role}</span>
                      <span>{item.topic}</span>
                      <span>{item.difficulty}</span>
                      <span>{item.score ?? '—'}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Complete your first interview to see history.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Root() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('roundwise_user') || 'null');
    } catch {
      return null;
    }
  });

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return <App user={user} onLogout={() => setUser(null)} />;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Root />
  </BrowserRouter>,
);
