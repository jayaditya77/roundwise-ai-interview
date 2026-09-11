import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:5001/api',
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
  create: (data) => api.post('/interviews', data),
  answer: (data) => api.post('/interviews/answer', data),
  history: () => api.get('/interviews/history'),
};

export const documentApi = {
  upload: (formData) => api.post('/documents/upload', formData),
  list: () => api.get('/documents'),
  search: (query) => api.post('/documents/search', { query }),
};
