import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('roundwise_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

export const interviewApi = {
  // Real Multi-turn Session APIs
  createSession: (data) => api.post('/interviews/sessions', data),
  getSession: (id) => api.get(`/interviews/sessions/${id}`),
  submitAnswer: (sessionId, data) => api.post(`/interviews/sessions/${sessionId}/answer`, data),
  nextQuestion: (sessionId, data) => api.post(`/interviews/sessions/${sessionId}/next-question`, data),
  completeSession: (sessionId) => api.post(`/interviews/sessions/${sessionId}/complete`),
  listSessions: () => api.get('/interviews/sessions'),

  // Legacy Single-Question APIs
  create: (data) => api.post('/interviews', data),
  answer: (data) => api.post('/interviews/answer', data),
  history: () => api.get('/interviews/history'),
};

export const documentApi = {
  upload: (formData) => api.post('/documents/upload', formData),
  list: () => api.get('/documents'),
  search: (query) => api.post('/documents/search', { query }),
};
