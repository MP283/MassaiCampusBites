import axios from 'axios';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const TOKEN_KEY = 'atp_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 180000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      const publicPaths = ['/', '/login', '/register'];
      if (!publicPaths.includes(path) && !path.startsWith('/invite')) {
        setToken(null);
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(err);
  }
);

/** Human-readable message from an axios error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  if (!err) return fallback;
  if (err.code === 'ERR_NETWORK') return `Cannot reach the server at ${API_URL}. Is the backend running?`;
  const d = err.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  if (Array.isArray(d?.detail)) return d.detail.map((x) => x.msg).join(', ');
  if (d?.message) return d.message;
  return err.message || fallback;
}

/** URL for a backend-served file or an authenticated download link. */
export function fileUrl(path) {
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function authedUrl(path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${API_URL}/api${path}${sep}token=${encodeURIComponent(getToken() || '')}`;
}

export default api;
