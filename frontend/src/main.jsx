import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import {
  Code2,
  Users,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  BookOpen,
  History,
  Briefcase,
  Layers,
  Award,
  LogOut,
  Send,
  FileCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { authApi, documentApi, interviewApi } from './services/api';
import './styles.css';

// =========================================================
// Authentication Component
// =========================================================

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

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
      setError(requestError.response?.data?.message || 'Authentication request failed');
    } finally {
      setLoading(false);
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
          <Sparkles size={22} />
          Round<span>wise</span>
        </div>

        <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">Next-generation AI mock interview platform.</p>

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
            placeholder="Email address"
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

          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        <button
          className="link"
          type="button"
          onClick={() => setMode(isLogin ? 'register' : 'login')}
        >
          {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

// =========================================================
// Main App Component
// =========================================================

function App({ user, onLogout }) {
  const [tab, setTab] = useState('practice');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Setup Form State
  const [role, setRole] = useState('Software Engineer');
  const [topic, setTopic] = useState('DSA');
  const [difficulty, setDifficulty] = useState('Medium');
  const [interviewType, setInterviewType] = useState('Technical');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [rag, setRag] = useState(true);

  // Active Session State
  const [activeSession, setActiveSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [questionFeedback, setQuestionFeedback] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [viewingPastReport, setViewingPastReport] = useState(null);

  // Timer State
  const [secondsRemaining, setSecondsRemaining] = useState(1800);
  const timerRef = useRef(null);

  // History & Documents
  const [sessionsHistory, setSessionsHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);

  // Accordion state for review
  const [expandedQuestions, setExpandedQuestions] = useState({});

  async function loadData() {
    try {
      const [historyResponse, documentsResponse] = await Promise.all([
        interviewApi.listSessions(),
        documentApi.list(),
      ]);
      setSessionsHistory(historyResponse.data || []);
      setDocuments(documentsResponse.data || []);
    } catch {
      // Backend may be starting or idle
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Timer tick effect
  useEffect(() => {
    if (activeSession && activeSession.status === 'in_progress' && secondsRemaining > 0) {
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [activeSession, secondsRemaining]);

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Handle duration choice change
  function handleDurationSelect(mins, questions) {
    setDurationMinutes(mins);
    setTotalQuestions(questions);
  }

  // Start new interview session
  async function startInterviewSession() {
    setLoading(true);
    setMessage('');
    setQuestionFeedback(null);
    setFinalReport(null);
    setUserAnswer('');

    try {
      const response = await interviewApi.createSession({
        role,
        topic,
        difficulty,
        interviewType,
        durationMinutes,
        totalQuestions,
        useRag: rag,
      });

      setActiveSession(response.data.session);
      setCurrentQuestion(response.data.currentQuestion);
      setSecondsRemaining(durationMinutes * 60);
      setTab('practice');
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not start interview session');
    } finally {
      setLoading(false);
    }
  }

  // Submit Answer to current question
  async function submitQuestionAnswer() {
    if (!userAnswer.trim() || !activeSession || !currentQuestion) return;

    setLoading(true);
    setMessage('');

    try {
      const response = await interviewApi.submitAnswer(activeSession.id, {
        questionId: currentQuestion.questionId,
        answer: userAnswer,
      });

      setQuestionFeedback(response.data.evaluation);

      if (response.data.isComplete && response.data.finalReport) {
        setFinalReport(response.data.finalReport);
        setActiveSession((prev) => ({ ...prev, status: 'completed' }));
        await loadData();
      }
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not evaluate answer');
    } finally {
      setLoading(false);
    }
  }

  // Advance to Next Question
  async function goToNextQuestion() {
    if (!activeSession) return;

    setLoading(true);
    setMessage('');
    setUserAnswer('');
    setQuestionFeedback(null);

    try {
      const response = await interviewApi.nextQuestion(activeSession.id, {
        useRag: rag,
      });

      setCurrentQuestion(response.data);
      setActiveSession((prev) => ({
        ...prev,
        currentQuestionIndex: response.data.questionNumber,
      }));
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not fetch next question');
    } finally {
      setLoading(false);
    }
  }

  // Conclude interview session early
  async function endSessionEarly() {
    if (!activeSession) return;
    const confirmEnd = window.confirm(
      'Are you sure you want to end this interview session? Your report will be generated based on answers submitted so far.',
    );
    if (!confirmEnd) return;

    setLoading(true);
    try {
      const response = await interviewApi.completeSession(activeSession.id);
      if (response.data.finalReport) {
        setFinalReport(response.data.finalReport);
        setActiveSession((prev) => ({ ...prev, status: 'completed' }));
      } else {
        setActiveSession(null);
        setCurrentQuestion(null);
      }
      await loadData();
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not complete session');
    } finally {
      setLoading(false);
    }
  }

  // View Past Session Report from History
  async function openPastReport(sessionId) {
    setLoading(true);
    try {
      const response = await interviewApi.getSession(sessionId);
      setViewingPastReport(response.data);
      setTab('practice');
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not load report');
    } finally {
      setLoading(false);
    }
  }

  // Upload study material
  async function uploadDocument() {
    if (!file) return;
    setLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await documentApi.upload(formData);
      setMessage(`Uploaded ${response.data.filename} (${response.data.chunks} chunks embedded)`);
      setFile(null);
      await loadData();
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  function resetSessionView() {
    setActiveSession(null);
    setCurrentQuestion(null);
    setQuestionFeedback(null);
    setFinalReport(null);
    setViewingPastReport(null);
    setUserAnswer('');
  }

  function logout() {
    localStorage.removeItem('roundwise_token');
    localStorage.removeItem('roundwise_user');
    onLogout();
  }

  const toggleAccordion = (qId) => {
    setExpandedQuestions((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const getScoreColorClass = (score) => {
    if (score >= 8) return 'score-green';
    if (score >= 5) return 'score-amber';
    return 'score-red';
  };

  const getRecBadgeClass = (rec) => {
    const r = (rec || '').toLowerCase();
    if (r.includes('strong')) return 'rec-strong-hire';
    if (r.includes('leaning')) return 'rec-leaning-hire';
    if (r.includes('hire')) return 'rec-hire';
    return 'rec-needs-improvement';
  };

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Sparkles size={20} />
          Round<span>wise</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          <button
            className={tab === 'practice' ? 'active' : ''}
            onClick={() => {
              setTab('practice');
            }}
            type="button"
          >
            <Briefcase size={17} />
            Interview Session
          </button>
          <button
            className={tab === 'history' ? 'active' : ''}
            onClick={() => {
              setTab('history');
              loadData();
            }}
            type="button"
          >
            <History size={17} />
            Session History
          </button>
          <button
            className={tab === 'knowledge' ? 'active' : ''}
            onClick={() => {
              setTab('knowledge');
              loadData();
            }}
            type="button"
          >
            <BookOpen size={17} />
            Knowledge Base
          </button>
        </nav>

        <div className="userbox">
          <b>{user.name}</b>
          <span>{user.email}</span>
          <button onClick={logout} type="button">
            <LogOut size={13} style={{ display: 'inline', marginRight: 4 }} />
            Logout
          </button>
        </div>
      </aside>

      <main>
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

        {/* =========================================================
            PRACTICE TAB
            ========================================================= */}
        {tab === 'practice' && (
          <>
            {/* VIEWING PAST REPORT */}
            {viewingPastReport && (
              <div>
                <button
                  className="btn-secondary"
                  onClick={() => setViewingPastReport(null)}
                  style={{ marginBottom: 20 }}
                  type="button"
                >
                  ← Back to Session View
                </button>

                <div className="report-hero">
                  <span className="badge badge-rag">
                    <FileCheck size={13} /> Completed Session
                  </span>
                  <h1>{viewingPastReport.session.role} Interview Report</h1>
                  <p>
                    {viewingPastReport.session.interviewType} Interview •{' '}
                    {viewingPastReport.session.topic} • {viewingPastReport.session.difficulty} •{' '}
                    {new Date(viewingPastReport.session.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {viewingPastReport.evaluationResult && (
                  <>
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <div className="metric-label">Overall Score</div>
                        <div className="metric-value">
                          {viewingPastReport.evaluationResult.overallScore}
                          <small>/10</small>
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Hiring Recommendation</div>
                        <span
                          className={`rec-badge ${getRecBadgeClass(
                            viewingPastReport.evaluationResult.recommendation,
                          )}`}
                        >
                          {viewingPastReport.evaluationResult.recommendation}
                        </span>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Technical Aptitude</div>
                        <div className="metric-value">
                          {viewingPastReport.evaluationResult.technicalScore ?? '—'}
                          <small>/10</small>
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Communication & Clarity</div>
                        <div className="metric-value">
                          {viewingPastReport.evaluationResult.communicationScore ?? '—'}
                          <small>/10</small>
                        </div>
                      </div>
                    </div>

                    <div className="report-section">
                      <h3>Executive Performance Summary</h3>
                      <p>{viewingPastReport.evaluationResult.summary}</p>
                    </div>

                    <div className="feedback-columns">
                      <div className="feedback-box strengths">
                        <b>
                          <CheckCircle2 size={16} /> Key Strengths Observed
                        </b>
                        <ul>
                          {viewingPastReport.evaluationResult.strengths?.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="feedback-box weaknesses">
                        <b>
                          <AlertTriangle size={16} /> Key Areas For Growth
                        </b>
                        <ul>
                          {viewingPastReport.evaluationResult.areasForImprovement?.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                )}

                <div className="report-section">
                  <h3>Question-by-Question Transcript ({viewingPastReport.questions.length})</h3>
                  {viewingPastReport.questions.map((q) => (
                    <div className="breakdown-item" key={q.id}>
                      <div
                        className="breakdown-summary"
                        onClick={() => toggleAccordion(q.id)}
                      >
                        <span>
                          <b>Question {q.questionOrder}:</b> {q.questionText}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className={`badge ${
                              q.answer?.score ? getScoreColorClass(q.answer.score) : ''
                            }`}
                            style={{ color: q.answer?.score ? '#fff' : '#666' }}
                          >
                            {q.answer?.score !== null && q.answer?.score !== undefined
                              ? `${q.answer.score}/10`
                              : 'Unanswered'}
                          </span>
                          {expandedQuestions[q.id] ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </span>
                      </div>

                      {expandedQuestions[q.id] && q.answer && (
                        <div className="breakdown-content">
                          <p>
                            <b>Candidate Answer:</b>
                          </p>
                          <p style={{ background: '#f9f9f8', padding: 12, borderRadius: 8 }}>
                            {q.answer.userAnswer}
                          </p>
                          <p>
                            <b>AI Feedback:</b> {q.answer.feedback}
                          </p>
                          {q.answer.idealAnswer && (
                            <p style={{ color: '#065f46' }}>
                              <b>Ideal Model Answer:</b> {q.answer.idealAnswer}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="report-actions">
                  <button className="primary" onClick={resetSessionView} type="button">
                    <RotateCcw size={15} /> Start New Interview Session
                  </button>
                </div>
              </div>
            )}

            {/* VIEWING NEWLY GENERATED FINAL REPORT */}
            {!viewingPastReport && finalReport && (
              <div>
                <div className="report-hero">
                  <span className="badge badge-rag">
                    <FileCheck size={13} /> Session Complete
                  </span>
                  <h1>Interview Evaluation Report</h1>
                  <p>
                    {activeSession.role} • {activeSession.interviewType} Round •{' '}
                    {activeSession.topic} • {activeSession.totalQuestions} Questions
                  </p>
                </div>

                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label">Overall Score</div>
                    <div className="metric-value">
                      {finalReport.overall_score}
                      <small>/10</small>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Hiring Recommendation</div>
                    <span
                      className={`rec-badge ${getRecBadgeClass(finalReport.recommendation)}`}
                    >
                      {finalReport.recommendation}
                    </span>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Technical Aptitude</div>
                    <div className="metric-value">
                      {finalReport.technical_score ?? finalReport.overall_score}
                      <small>/10</small>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Communication & Clarity</div>
                    <div className="metric-value">
                      {finalReport.communication_score ?? finalReport.overall_score}
                      <small>/10</small>
                    </div>
                  </div>
                </div>

                <div className="report-section">
                  <h3>Executive Assessment</h3>
                  <p>{finalReport.summary}</p>
                </div>

                <div className="feedback-columns">
                  <div className="feedback-box strengths">
                    <b>
                      <CheckCircle2 size={16} /> Key Strengths Exhibited
                    </b>
                    <ul>
                      {finalReport.strengths?.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="feedback-box weaknesses">
                    <b>
                      <AlertTriangle size={16} /> Primary Areas for Improvement
                    </b>
                    <ul>
                      {finalReport.areas_for_improvement?.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="report-actions">
                  <button className="primary" onClick={resetSessionView} type="button">
                    <RotateCcw size={15} /> Practice Another Session
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      resetSessionView();
                      setTab('history');
                      loadData();
                    }}
                    type="button"
                  >
                    View All Past Interviews
                  </button>
                </div>
              </div>
            )}

            {/* ACTIVE INTERVIEW IN PROGRESS */}
            {!viewingPastReport && !finalReport && activeSession && currentQuestion && (
              <div className="session-container">
                <div className="session-header-bar">
                  <div className="session-info">
                    <span
                      className={`badge ${
                        activeSession.interviewType === 'HR'
                          ? 'badge-hr'
                          : activeSession.interviewType === 'Mixed'
                          ? 'badge-mixed'
                          : 'badge-tech'
                      }`}
                    >
                      {activeSession.interviewType} Round
                    </span>
                    <h2>
                      {activeSession.role} — {activeSession.topic}
                    </h2>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      className={`timer-pill ${
                        secondsRemaining < 60
                          ? 'timer-danger'
                          : secondsRemaining < 300
                          ? 'timer-warn'
                          : ''
                      }`}
                    >
                      <Clock size={15} />
                      {formatTime(secondsRemaining)}
                    </div>

                    <button
                      className="btn-ghost"
                      onClick={endSessionEarly}
                      title="End session early and synthesize report"
                      type="button"
                    >
                      End Early
                    </button>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontWeight: 650,
                      color: '#6b7280',
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      Question {currentQuestion.questionNumber} of{' '}
                      {currentQuestion.totalQuestions}
                    </span>
                    <span>
                      {Math.round(
                        (currentQuestion.questionNumber / currentQuestion.totalQuestions) * 100,
                      )}
                      % Progress
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${
                          (currentQuestion.questionNumber / currentQuestion.totalQuestions) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="question-card">
                  <div className="question-meta">
                    <span className="badge">
                      Question {currentQuestion.questionNumber} of{' '}
                      {currentQuestion.totalQuestions}
                    </span>
                    <span
                      className={`badge ${
                        currentQuestion.type === 'behavioral' ? 'badge-hr' : 'badge-tech'
                      }`}
                    >
                      {currentQuestion.type === 'behavioral'
                        ? 'Behavioral / HR'
                        : 'Technical Question'}
                    </span>
                    <span className="badge">{activeSession.difficulty}</span>
                    {currentQuestion.usedRag && (
                      <span className="badge badge-rag">RAG Grounded</span>
                    )}
                  </div>

                  <h3 className="question-text">{currentQuestion.question}</h3>

                  {currentQuestion.expectedPoints?.length > 0 && (
                    <details className="expected-points-box">
                      <summary>💡 View Key Evaluation Points</summary>
                      <ul>
                        {currentQuestion.expectedPoints.map((point, idx) => (
                          <li key={idx}>{point}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {!questionFeedback && (
                    <div className="answer-area">
                      <textarea
                        rows="7"
                        placeholder={
                          currentQuestion.type === 'behavioral'
                            ? 'Provide your response using the STAR method: Situation, Task, Action, and Result...'
                            : 'Explain your technical approach, trade-offs, time/space complexity, and edge cases...'
                        }
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        disabled={loading}
                      />
                      <div className="answer-actions">
                        <span className="answer-tip">
                          {userAnswer.trim().split(/\s+/).filter(Boolean).length} words • Tip:{' '}
                          {currentQuestion.type === 'behavioral'
                            ? 'Highlight your personal actions'
                            : 'State assumptions clearly'}
                        </span>

                        <button
                          className="primary"
                          onClick={submitQuestionAnswer}
                          disabled={!userAnswer.trim() || loading}
                          type="button"
                        >
                          <Send size={15} />
                          {loading ? 'Evaluating...' : 'Submit Answer'}
                        </button>
                      </div>
                    </div>
                  )}

                  {questionFeedback && (
                    <div className="feedback-card">
                      <div className="feedback-header">
                        <div
                          className={`score-badge-large ${getScoreColorClass(
                            questionFeedback.score,
                          )}`}
                        >
                          {questionFeedback.score}
                          <small>/10</small>
                        </div>
                        <div className="feedback-summary">
                          <h3>Question Feedback</h3>
                          <p>{questionFeedback.feedback}</p>
                        </div>
                      </div>

                      <div className="feedback-columns">
                        <div className="feedback-box strengths">
                          <b>
                            <CheckCircle2 size={16} /> Strengths
                          </b>
                          <ul>
                            {questionFeedback.strengths?.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="feedback-box weaknesses">
                          <b>
                            <AlertTriangle size={16} /> Areas to Improve
                          </b>
                          <ul>
                            {questionFeedback.weaknesses?.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {questionFeedback.idealAnswer && (
                        <details className="ideal-answer-box">
                          <summary>🔍 View Model Ideal Answer</summary>
                          <p>{questionFeedback.idealAnswer}</p>
                        </details>
                      )}

                      <div className="next-action-bar">
                        {currentQuestion.questionNumber < currentQuestion.totalQuestions ? (
                          <button
                            className="primary"
                            onClick={goToNextQuestion}
                            disabled={loading}
                            type="button"
                          >
                            {loading ? (
                              'Preparing next question...'
                            ) : (
                              <>
                                Continue to Question {currentQuestion.questionNumber + 1}{' '}
                                <ChevronRight size={16} />
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            className="primary"
                            onClick={() => {
                              // If it was the last question, report was already generated
                              // or can be triggered
                              if (finalReport) {
                                // Final report view handles it
                              }
                            }}
                            type="button"
                          >
                            <Award size={16} /> Interview Complete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SETUP FORM: SHOWN WHEN NO SESSION IS ACTIVE */}
            {!viewingPastReport && !finalReport && !activeSession && (
              <div>
                <header>
                  <h1>Start an Interview Session</h1>
                  <p className="muted">
                    Configure a complete multi-turn interview with real-time feedback and an
                    executive final report.
                  </p>
                </header>

                <div className="card">
                  <div className="setup-section-title">1. Select Interview Format</div>
                  <div className="selection-grid">
                    <button
                      type="button"
                      className={`select-card ${
                        interviewType === 'Technical' ? 'active' : ''
                      }`}
                      onClick={() => setInterviewType('Technical')}
                    >
                      <div className="select-card-header">
                        <b>Technical Interview</b>
                        <Code2 size={18} color="#1d4ed8" />
                      </div>
                      <p>
                        Algorithms, data structures, DBMS, system design, and coding architecture.
                      </p>
                    </button>

                    <button
                      type="button"
                      className={`select-card ${interviewType === 'HR' ? 'active' : ''}`}
                      onClick={() => setInterviewType('HR')}
                    >
                      <div className="select-card-header">
                        <b>HR & Behavioral</b>
                        <Users size={18} color="#be185d" />
                      </div>
                      <p>
                        STAR method scenarios, conflict resolution, leadership, and team ownership.
                      </p>
                    </button>

                    <button
                      type="button"
                      className={`select-card ${interviewType === 'Mixed' ? 'active' : ''}`}
                      onClick={() => setInterviewType('Mixed')}
                    >
                      <div className="select-card-header">
                        <b>Mixed Interview</b>
                        <Sparkles size={18} color="#7e22ce" />
                      </div>
                      <p>
                        Full-loop mock interview balancing technical depth and behavioral culture fit.
                      </p>
                    </button>
                  </div>

                  <div className="setup-section-title">2. Select Duration & Question Count</div>
                  <div className="selection-grid">
                    <button
                      type="button"
                      className={`select-card ${
                        durationMinutes === 15 && totalQuestions === 3 ? 'active' : ''
                      }`}
                      onClick={() => handleDurationSelect(15, 3)}
                    >
                      <div className="select-card-header">
                        <b>15 Minutes</b>
                        <span className="badge">3 Questions</span>
                      </div>
                      <p>Fast sprint focused on core problem breakdown.</p>
                    </button>

                    <button
                      type="button"
                      className={`select-card ${
                        durationMinutes === 30 && totalQuestions === 5 ? 'active' : ''
                      }`}
                      onClick={() => handleDurationSelect(30, 5)}
                    >
                      <div className="select-card-header">
                        <b>30 Minutes</b>
                        <span className="badge">5 Questions</span>
                      </div>
                      <p>Standard mock round simulating industry technical interviews.</p>
                    </button>

                    <button
                      type="button"
                      className={`select-card ${
                        durationMinutes === 45 && totalQuestions === 10 ? 'active' : ''
                      }`}
                      onClick={() => handleDurationSelect(45, 10)}
                    >
                      <div className="select-card-header">
                        <b>45 Minutes</b>
                        <span className="badge">10 Questions</span>
                      </div>
                      <p>Full comprehensive loop with deep dives and edge cases.</p>
                    </button>
                  </div>

                  <div className="setup-section-title">3. Role, Topic & Difficulty</div>
                  <div className="form-grid">
                    <label>
                      Role
                      <select value={role} onChange={(e) => setRole(e.target.value)}>
                        <option>Software Engineer</option>
                        <option>Backend Developer</option>
                        <option>Frontend Developer</option>
                        <option>Full Stack Developer</option>
                        <option>Data Analyst</option>
                        <option>DevOps / Cloud Engineer</option>
                      </select>
                    </label>

                    <label>
                      Primary Topic
                      <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                        <option>DSA</option>
                        <option>DBMS</option>
                        <option>OOP</option>
                        <option>Operating Systems</option>
                        <option>System Design</option>
                        <option>Full Stack Web</option>
                        <option>Behavioral & Leadership</option>
                      </select>
                    </label>

                    <label>
                      Difficulty
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                      >
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={rag}
                        onChange={(e) => setRag(e.target.checked)}
                      />
                      <span>
                        Ground questions using my uploaded study materials (RAG)
                        {documents.length > 0 && ` • ${documents.length} documents ready`}
                      </span>
                    </label>
                  </div>

                  <button
                    className="primary start-btn"
                    onClick={startInterviewSession}
                    disabled={loading}
                    type="button"
                  >
                    <Sparkles size={17} />
                    {loading ? 'Creating Interview Session...' : 'Start Interview Session'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* =========================================================
            SESSION HISTORY TAB
            ========================================================= */}
        {tab === 'history' && (
          <section>
            <header>
              <h1>Interview Session History</h1>
              <p className="muted">
                Review your completed sessions, scores, and hiring recommendations.
              </p>
            </header>

            <div className="card">
              {sessionsHistory.length ? (
                <div className="table">
                  <div className="tr th">
                    <span>Role & Topic</span>
                    <span>Format</span>
                    <span>Questions</span>
                    <span>Score</span>
                    <span>Recommendation</span>
                    <span>Action</span>
                  </div>

                  {sessionsHistory.map((item) => (
                    <div className="tr" key={item.id}>
                      <div>
                        <b>{item.role}</b>
                        <div style={{ color: '#6b7280', fontSize: 11 }}>
                          {item.topic} • {item.difficulty} •{' '}
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div>
                        <span
                          className={`badge ${
                            item.interviewType === 'HR'
                              ? 'badge-hr'
                              : item.interviewType === 'Mixed'
                              ? 'badge-mixed'
                              : 'badge-tech'
                          }`}
                        >
                          {item.interviewType || 'Technical'}
                        </span>
                      </div>

                      <div>
                        <span>
                          {item.answeredCount ?? item.totalQuestions}/{item.totalQuestions} Qs (
                          {item.durationMinutes}m)
                        </span>
                      </div>

                      <div>
                        {item.overallScore !== null && item.overallScore !== undefined ? (
                          <b>{item.overallScore}/10</b>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>In progress</span>
                        )}
                      </div>

                      <div>
                        {item.recommendation ? (
                          <span
                            className={`rec-badge ${getRecBadgeClass(item.recommendation)}`}
                            style={{ fontSize: 12, padding: '3px 9px' }}
                          >
                            {item.recommendation}
                          </span>
                        ) : (
                          <span className={`status-badge status-${item.status}`}>
                            {item.status}
                          </span>
                        )}
                      </div>

                      <div>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={() => openPastReport(item.id)}
                          type="button"
                        >
                          View Report →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No interview sessions found yet. Start your first session!</p>
              )}
            </div>
          </section>
        )}

        {/* =========================================================
            KNOWLEDGE BASE TAB
            ========================================================= */}
        {tab === 'knowledge' && (
          <section>
            <header>
              <h1>Knowledge Base & Study Materials</h1>
              <p className="muted">
                Upload PDFs of technical topics, company question banks, or notes. Questions will
                be grounded via vector embeddings and cosine similarity.
              </p>
            </header>

            <div className="card upload">
              <h2>Upload Study Material</h2>
              <p className="muted">
                PDFs are parsed into 1,200-character overlapping chunks and embedded with Gemini.
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
                {loading ? 'Processing & Embedding...' : 'Upload PDF'}
              </button>
            </div>

            <div className="card" style={{ marginTop: 24 }}>
              <h2>Your Uploaded Documents ({documents.length})</h2>

              {documents.length ? (
                <ul className="docs">
                  {documents.map((document) => (
                    <li key={document.id}>
                      <span>
                        <b>{document.filename}</b>
                      </span>
                      <small>{new Date(document.created_at).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No study materials uploaded yet.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// =========================================================
// Root Component
// =========================================================

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
