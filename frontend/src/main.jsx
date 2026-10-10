import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import '@fontsource-variable/ibm-plex-sans';
import {
  Code2,
  Users,
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
  FileText,
  User,
  Upload,
} from 'lucide-react';
import { authApi, documentApi, interviewApi, resumeApi } from './services/api';
import './styles.css';

// =========================================================
// Authentication Component
// =========================================================

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const verificationToken = params.get('verify');
    const passwordResetToken = params.get('reset');
    if (passwordResetToken) {
      setResetToken(passwordResetToken);
      setMode('reset');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      return;
    }
    if (!verificationToken) return;

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setMode('verifying');
    setLoading(true);
    authApi.verifyEmail(verificationToken)
      .then((response) => {
        localStorage.setItem('roundwise_token', response.data.token);
        localStorage.setItem('roundwise_user', JSON.stringify(response.data.user));
        onLogin(response.data.user);
        navigate('/');
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.message || 'Verification link is invalid or expired.');
        setMode('verifyPending');
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const response = await authApi.forgotPassword(form.email);
        setNotice(response.data.message);
        setMode('forgotSent');
        return;
      }

      if (mode === 'reset') {
        if (form.password.length < 8) {
          setError('Use at least 8 characters for your new password.');
          return;
        }
        if (form.password !== form.confirmPassword) {
          setError('The passwords do not match.');
          return;
        }
        const response = await authApi.resetPassword({ token: resetToken, password: form.password });
        setNotice(response.data.message);
        setForm({ name: '', email: form.email, password: '' });
        setResetToken('');
        setMode('login');
        return;
      }

      if (mode === 'register') {
        const response = await authApi.register(form);
        setNotice(response.data.message);
        setMode('verifyPending');
        return;
      }

      const response = await authApi.login(form);

      localStorage.setItem('roundwise_token', response.data.token);
      localStorage.setItem('roundwise_user', JSON.stringify(response.data.user));
      onLogin(response.data.user);
      navigate('/');
    } catch (requestError) {
      if (requestError.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setMode('verifyPending');
        setNotice('Verify your email before signing in. You can request a fresh link below.');
      } else if (requestError.response?.status === 503 && mode === 'register') {
        setMode('verifyPending');
        setError(requestError.response.data.message);
      } else {
        setError(requestError.response?.data?.message || 'Authentication request failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const response = await authApi.resendVerification(form.email);
      setNotice(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not resend the verification email.');
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const title = {
    login: 'Welcome back',
    register: 'Create your account',
    verifyPending: 'Verify your email',
    verifying: 'Verifying your email',
    forgot: 'Reset your password',
    forgotSent: 'Check your inbox',
    reset: 'Choose a new password',
  }[mode];

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <Layers size={20} />
          Round<span>wise</span>
        </div>

        <h1>{title}</h1>
        {['login', 'register'].includes(mode) && (
          <p className="muted">Structured interview practice, with feedback you can use.</p>
        )}

        {['login', 'register', 'forgot', 'reset'].includes(mode) && (
          <form onSubmit={submit}>
            {isRegister && (
              <input
                autoComplete="name"
                placeholder="Full name"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
              />
            )}

            {!isReset && (
              <input
                type="email"
                autoComplete="email"
                placeholder="Email address"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                required
              />
            )}

            {!isForgot && !isReset && (
              <input
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="Password (at least 8 characters)"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                minLength={8}
                required
              />
            )}

            {isReset && (
              <>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password (at least 8 characters)"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  minLength={8}
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={form.confirmPassword || ''}
                  onChange={(event) => updateField('confirmPassword', event.target.value)}
                  minLength={8}
                  required
                />
              </>
            )}

            {isLogin && (
              <button className="auth-inline-link" type="button" onClick={() => setMode('forgot')}>
                Forgot password?
              </button>
            )}

            {notice && <div className="auth-notice" role="status">{notice}</div>}
            {error && <div className="error" role="alert">{error}</div>}

            <button className="primary" type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : isLogin
                ? 'Sign in'
                : isRegister
                ? 'Create account'
                : isForgot
                ? 'Send reset link'
                : 'Update password'}
            </button>
          </form>
        )}

        {mode === 'verifyPending' && (
          <div className="auth-message-view">
            <p className="muted">We’ll send a sign-in link to the address below. Open it to verify your account.</p>
            <input
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              required
            />
            {notice && <div className="auth-notice" role="status">{notice}</div>}
            {error && <div className="error" role="alert">{error}</div>}
            <button className="primary" onClick={resendVerification} disabled={loading || !form.email} type="button">
              {loading ? 'Sending...' : 'Resend verification email'}
            </button>
          </div>
        )}

        {mode === 'forgotSent' && (
          <div className="auth-message-view">
            <p className="muted">{notice}</p>
          </div>
        )}

        {mode === 'verifying' && (
          <div className="auth-message-view">
            <p className="muted">{loading ? 'Please wait while we confirm your address.' : notice}</p>
          </div>
        )}

        {['login', 'register', 'forgot', 'reset', 'verifyPending', 'forgotSent'].includes(mode) && (
          <button
            className="link"
            type="button"
            onClick={() => {
              setError('');
              setNotice('');
              setMode(isLogin ? 'register' : 'login');
            }}
          >
            {isLogin ? "Don't have an account? Register" : 'Back to sign in'}
          </button>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Main App Component
// =========================================================

function getTopicPerformance(sessions) {
  const scoresByTopic = new Map();

  sessions.forEach((session) => {
    if (session.status !== 'completed' || session.overallScore === null || session.overallScore === undefined) {
      return;
    }

    const topic = session.topic?.trim();
    const score = Number(session.overallScore);
    if (!topic || !Number.isFinite(score)) return;

    const scores = scoresByTopic.get(topic) || [];
    scores.push(score);
    scoresByTopic.set(topic, scores);
  });

  return Array.from(scoresByTopic, ([topic, scores]) => ({
    topic,
    sessions: scores.length,
    average: scores.reduce((total, score) => total + score, 0) / scores.length,
  })).sort((first, second) => first.average - second.average || second.sessions - first.sessions);
}

function App({ user, onLogout, onUserUpdate }) {
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
  const [useResume, setUseResume] = useState(false);

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
  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Accordion state for review
  const [expandedQuestions, setExpandedQuestions] = useState({});

  async function loadData() {
    try {
      const [historyResponse, documentsResponse, resumeResponse] = await Promise.all([
        interviewApi.listSessions(),
        documentApi.list(),
        resumeApi.get(),
      ]);
      setSessionsHistory(historyResponse.data || []);
      setDocuments(documentsResponse.data || []);
      setResumeProfile(resumeResponse.data || null);
    } catch {
      // Backend may be starting or idle
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const response = await authApi.getProfile();
      setProfile({
        ...response.data,
        graduationYear: response.data.graduationYear || '',
      });
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not load your profile.');
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileSaving(true);
    setMessage('');
    try {
      const response = await authApi.updateProfile({
        name: profile.name,
        college: profile.college || '',
        degree: profile.degree || '',
        graduationYear: profile.graduationYear || '',
        targetRole: profile.targetRole || '',
        experienceLevel: profile.experienceLevel || '',
        location: profile.location || '',
      });
      setProfile({ ...response.data, graduationYear: response.data.graduationYear || '' });
      const updatedUser = { ...user, name: response.data.name, email: response.data.email };
      localStorage.setItem('roundwise_user', JSON.stringify(updatedUser));
      onUserUpdate(updatedUser);
      setMessage('Profile saved.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Could not save your profile.');
    } finally {
      setProfileSaving(false);
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
        useResume: useResume && !!resumeProfile,
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
        useResume: useResume && !!resumeProfile,
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
      setMessage(`Uploaded ${response.data.filename}`);
      setFile(null);
      await loadData();
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  // Upload resume
  async function uploadResumeFile() {
    if (!resumeFile) return;
    setResumeUploading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      const response = await resumeApi.upload(formData);
      setResumeProfile(response.data);
      setResumeFile(null);
      setUseResume(true);
      setMessage(`✅ Resume parsed successfully for ${response.data.name}! ${response.data.skills?.length || 0} skills and ${response.data.projects?.length || 0} projects extracted.`);
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || 'Resume upload failed');
    } finally {
      setResumeUploading(false);
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

  const topicPerformance = getTopicPerformance(sessionsHistory);
  const recommendedTopic = topicPerformance[0];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Layers size={19} />
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
            className={tab === 'profile' ? 'active' : ''}
            onClick={() => {
              setTab('profile');
              loadProfile();
            }}
            type="button"
          >
            <User size={17} />
            Profile
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

        {tab === 'profile' && (
          <section className="profile-page">
            <header>
              <h1>Your Profile</h1>
              <p className="muted">Manage the details you use for interview preparation.</p>
            </header>

            <form className="card profile-form" onSubmit={saveProfile}>
              {profileLoading ? (
                <p className="muted">Loading profile...</p>
              ) : (
                <>
                  <section className="profile-form-section">
                    <div className="profile-form-heading">
                      <h2>Account details</h2>
                      <p>Your email is used to sign in and is verified.</p>
                    </div>
                    <div className="profile-grid">
                      <label>
                        Full name
                        <input
                          autoComplete="name"
                          maxLength={100}
                          value={profile.name || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        Email address
                        <input type="email" value={profile.email || ''} readOnly aria-readonly="true" />
                      </label>
                    </div>
                  </section>

                  <section className="profile-form-section">
                    <div className="profile-form-heading">
                      <h2>Education</h2>
                      <p>Optional details for your academic background.</p>
                    </div>
                    <div className="profile-grid">
                      <label>
                        College or university
                        <input
                          autoComplete="organization"
                          maxLength={180}
                          placeholder="e.g. State University"
                          value={profile.college || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, college: event.target.value }))}
                        />
                      </label>
                      <label>
                        Degree or program
                        <input
                          maxLength={140}
                          placeholder="e.g. B.S. Computer Science"
                          value={profile.degree || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, degree: event.target.value }))}
                        />
                      </label>
                      <label>
                        Graduation year
                        <input
                          type="number"
                          min={1950}
                          max={2150}
                          placeholder="e.g. 2027"
                          value={profile.graduationYear || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, graduationYear: event.target.value }))}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="profile-form-section">
                    <div className="profile-form-heading">
                      <h2>Career focus</h2>
                      <p>Help keep your practice goals organized.</p>
                    </div>
                    <div className="profile-grid">
                      <label>
                        Target role
                        <input
                          maxLength={120}
                          placeholder="e.g. Backend Engineer"
                          value={profile.targetRole || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, targetRole: event.target.value }))}
                        />
                      </label>
                      <label>
                        Experience level
                        <select
                          value={profile.experienceLevel || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, experienceLevel: event.target.value }))}
                        >
                          <option value="">Select level</option>
                          <option>Student</option>
                          <option>Entry-level</option>
                          <option>Early career</option>
                          <option>Mid-career</option>
                          <option>Senior</option>
                        </select>
                      </label>
                      <label>
                        Location
                        <input
                          autoComplete="address-level2"
                          maxLength={120}
                          placeholder="City or region"
                          value={profile.location || ''}
                          onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))}
                        />
                      </label>
                    </div>
                  </section>

                  <div className="profile-form-actions">
                    <span className="muted">Your profile is private to your account.</span>
                    <button className="primary" type="submit" disabled={profileSaving}>
                      {profileSaving ? 'Saving...' : 'Save profile'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </section>
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
                      <h3>Performance Summary</h3>
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
                            <b>Feedback:</b> {q.answer.feedback}
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
            {!viewingPastReport && finalReport && !questionFeedback && (
              <div>
                <div className="report-hero">
                  <span className="badge badge-rag">
                    <FileCheck size={13} /> Session Complete
                  </span>
                  <h1>Session Summary</h1>
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
            {!viewingPastReport && (!finalReport || questionFeedback) && activeSession && currentQuestion && (
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
                      <span className="badge badge-rag">Study Materials</span>
                    )}
                    {useResume && resumeProfile && (
                      <span className="badge badge-resume"><User size={11} /> Resume Grounded</span>
                    )}
                  </div>

                  <h3 className="question-text">{currentQuestion.question}</h3>

                  {currentQuestion.expectedPoints?.length > 0 && (
                    <details className="expected-points-box">
                      <summary>View evaluation criteria</summary>
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
                          <summary>View sample answer</summary>
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
                            onClick={() => setQuestionFeedback(null)}
                            type="button"
                          >
                            <Award size={16} /> View Final Report <ChevronRight size={16} />
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
                    Set up a focused session with immediate feedback after every answer.
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
                        <Layers size={18} />
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

                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={rag}
                        onChange={(e) => setRag(e.target.checked)}
                      />
                      <span>
                        Use my uploaded study materials
                        {documents.length > 0 && ` • ${documents.length} documents ready`}
                      </span>
                    </label>
                    <label className={`toggle ${!resumeProfile ? 'toggle-disabled' : ''}`}>
                      <input
                        type="checkbox"
                        checked={useResume && !!resumeProfile}
                        onChange={(e) => setUseResume(e.target.checked)}
                        disabled={!resumeProfile}
                      />
                      <span>
                        Ground questions using my resume (projects &amp; skills)
                        {resumeProfile
                          ? ` • ${resumeProfile.name} — ${resumeProfile.skills?.length || 0} skills, ${resumeProfile.projects?.length || 0} projects`
                          : ' • Upload your resume in Knowledge Base first'}
                      </span>
                    </label>
                  </div>

                  <button
                    className="primary start-btn"
                    onClick={startInterviewSession}
                    disabled={loading}
                    type="button"
                  >
                    <Briefcase size={17} />
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
                See your progress by topic and choose what to practice next.
              </p>
            </header>

            <section className="practice-plan" aria-labelledby="practice-plan-title">
              <div className="practice-plan-heading">
                <div>
                  <span className="practice-plan-eyebrow"><TrendingUp size={14} /> Progress overview</span>
                  <h2 id="practice-plan-title">Your topic practice plan</h2>
                </div>
                <span className="practice-plan-count">
                  {topicPerformance.length} {topicPerformance.length === 1 ? 'topic' : 'topics'} tracked
                </span>
              </div>

              {topicPerformance.length ? (
                <div className="practice-plan-content">
                  <div className="practice-recommendation">
                    <span className="recommendation-label">Recommended next</span>
                    <h3>{recommendedTopic.topic}</h3>
                    <p>
                      Lowest average across {recommendedTopic.sessions}{' '}
                      {recommendedTopic.sessions === 1 ? 'session' : 'sessions'}.
                      {' '}Practice this topic to build consistency.
                    </p>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setTopic(recommendedTopic.topic);
                        setTab('practice');
                      }}
                      type="button"
                    >
                      Set up practice <ChevronRight size={15} />
                    </button>
                  </div>

                  <div className="topic-performance-list">
                    {topicPerformance.map((item) => (
                      <div className="topic-performance" key={item.topic}>
                        <div className="topic-performance-meta">
                          <b>{item.topic}</b>
                          <span>{item.average.toFixed(1)}/10</span>
                        </div>
                        <div
                          className="topic-score-track"
                          role="img"
                          aria-label={`${item.topic}: ${item.average.toFixed(1)} out of 10`}
                        >
                          <span
                            className={item.average < 6 ? 'topic-score-fill needs-practice' : 'topic-score-fill'}
                            style={{ width: `${Math.max(0, Math.min(100, item.average * 10))}%` }}
                          />
                        </div>
                        <small>{item.sessions} completed {item.sessions === 1 ? 'session' : 'sessions'}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="practice-plan-empty">
                  Complete an interview session to see topic scores and a personalized practice focus.
                </p>
              )}
            </section>

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
          <section className="knowledge-page">
            <header>
              <div className="knowledge-kicker"><BookOpen size={15} /> Your library</div>
              <h1>Knowledge Base &amp; Study Materials</h1>
              <p className="muted">
                Keep your resume and study PDFs together in one place.
              </p>
            </header>

            {/* ===== RESUME UPLOAD ===== */}
            <div className="card resume-card">
              <div className="resume-card-header">
                <div>
                  <h2><FileText size={18} /> Your Resume</h2>
                  <p className="muted">
                    Keep your experience and background on hand for interview practice.
                  </p>
                </div>
                {resumeProfile && (
                  <span className="badge badge-resume">
                    Active
                  </span>
                )}
              </div>

              {resumeProfile ? (
                <div className="resume-profile">
                  <div className="resume-profile-name">
                    <User size={20} />
                    <div>
                      <b>{resumeProfile.name}</b>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{resumeProfile.filename}</p>
                    </div>
                  </div>

                  {resumeProfile.summary && (
                    <p style={{ fontSize: 13, color: '#4b5563', margin: '12px 0 0', lineHeight: 1.6 }}>
                      {resumeProfile.summary}
                    </p>
                  )}

                  {resumeProfile.skills?.length > 0 && (
                    <div className="resume-section">
                      <b>Skills</b>
                      <div className="skill-chips">
                        {resumeProfile.skills.map((s, i) => (
                          <span key={i} className="skill-chip">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {resumeProfile.projects?.length > 0 && (
                    <div className="resume-section">
                      <b>Projects ({resumeProfile.projects.length})</b>
                      <div className="project-list">
                        {resumeProfile.projects.map((p, i) => (
                          <div key={i} className="project-item">
                            <div className="project-name">{p.name}</div>
                            <p className="project-desc">{p.description}</p>
                            {p.technologies?.length > 0 && (
                              <div className="skill-chips" style={{ marginTop: 4 }}>
                                {p.technologies.map((t, j) => (
                                  <span key={j} className="skill-chip skill-chip-sm">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resumeProfile.experience?.length > 0 && (
                    <div className="resume-section">
                      <b>Experience</b>
                      {resumeProfile.experience.map((e, i) => (
                        <div key={i} style={{ marginTop: 8 }}>
                          <b style={{ fontSize: 13 }}>{e.role}</b>
                          {e.company && <span style={{ color: '#6b7280', fontSize: 12 }}> @ {e.company}</span>}
                          {e.duration && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 6 }}>({e.duration})</span>}
                          {e.responsibilities && (
                            <p style={{ fontSize: 12, color: '#4b5563', margin: '2px 0 0' }}>{e.responsibilities}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Replace resume:</p>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      <button
                        className="btn-secondary"
                        disabled={!resumeFile || resumeUploading}
                        onClick={uploadResumeFile}
                        type="button"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {resumeUploading ? 'Parsing...' : 'Replace Resume'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="resume-upload-empty">
                  <div className="resume-upload-icon"><FileText size={22} /></div>
                  <p>No resume added yet. Choose a PDF to add it to your library.</p>
                  <div className="resume-upload-controls">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    />
                    <button
                      className="primary"
                      disabled={!resumeFile || resumeUploading}
                      onClick={uploadResumeFile}
                      type="button"
                    >
                      {resumeUploading ? 'Uploading...' : 'Upload Resume'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ===== STUDY MATERIALS ===== */}
            <div className="knowledge-grid">
              <div className="card knowledge-upload">
                <div className="knowledge-card-title">
                  <span className="knowledge-icon"><Upload size={18} /></span>
                  <div>
                    <h2>Add study materials</h2>
                    <p className="muted">Choose a PDF to add to your library.</p>
                  </div>
                </div>

                <label className="knowledge-file-picker" htmlFor="study-material-file">
                  <FileText size={17} />
                  <span>{file?.name || 'Choose a PDF file'}</span>
                  <input
                    id="study-material-file"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>

                <button
                  className="primary knowledge-upload-button"
                  disabled={!file || loading}
                  onClick={uploadDocument}
                  type="button"
                >
                  {loading ? 'Uploading...' : 'Upload PDF'}
                </button>
              </div>

              <div className="card knowledge-library">
                <div className="knowledge-library-header">
                  <div>
                    <h2>Study materials</h2>
                    <p className="muted">PDFs you have added to your library.</p>
                  </div>
                  <span className="knowledge-count">{documents.length}</span>
                </div>

                {documents.length ? (
                  <ul className="docs">
                    {documents.map((document) => (
                      <li key={document.id}>
                        <span className="knowledge-document-icon"><FileText size={17} /></span>
                        <span className="knowledge-document-details">
                          <b>{document.filename}</b>
                          <small>Added {new Date(document.created_at).toLocaleString()}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="knowledge-empty">
                    <BookOpen size={21} />
                    <p>Your study PDFs will appear here.</p>
                  </div>
                )}
              </div>
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

  return (
    <App
      user={user}
      onLogout={() => setUser(null)}
      onUserUpdate={setUser}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Root />
  </BrowserRouter>,
);
