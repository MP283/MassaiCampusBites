import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const TOKEN_KEY = 'campusbite_token';
const USER_KEY = 'campusbite_user';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const tokenStore = {
  get: () => safeGet(TOKEN_KEY),
  set: (t) => safeSet(TOKEN_KEY, t),
  getUser: () => {
    try {
      return JSON.parse(safeGet(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  setUser: (u) => safeSet(USER_KEY, u ? JSON.stringify(u) : null),
};

const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 60000 });

// Attach the JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/invalid token -> clear session and go to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && tokenStore.get()) {
      tokenStore.set(null);
      tokenStore.setUser(null);
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login?expired=1';
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = 'Something went wrong') {
  if (!err) return fallback;
  if (err.code === 'ERR_NETWORK') return `Cannot reach the server at ${API_URL}. Is the backend running?`;
  const d = err.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  if (Array.isArray(d?.detail)) return d.detail.map((x) => x.msg).join(', ');
  return err.message || fallback;
}

export default api;
