import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { HOME, useAuth } from '../context/AuthContext';
import { Alert, Button } from '../components/ui';

const DEMO = [
  ['Customer', 'customer@demo.com'],
  ['Restaurant owner', 'owner@demo.com'],
  ['Delivery partner', 'delivery@demo.com'],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const expired = location.search.includes('expired=1');

  if (user) return <Navigate to={HOME[user.role]} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.access_token, data.user);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : HOME[data.user.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
      <div className="card auth-card">
        <h1 className="center">Welcome back 👋</h1>
        <p className="center muted">Log in to CampusBite</p>
        {expired && <Alert type="info">Your session expired. Please log in again.</Alert>}
        <Alert onClose={() => setError('')}>{error}</Alert>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Email
            <input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">
            Password
            <input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <Button type="submit" loading={busy} className="btn-block btn-lg">Log in</Button>
        </form>
        <div className="section-box mt small">
          <b>Demo accounts</b> (password <code>password123</code>)
          <div className="row mt" style={{ gap: 6 }}>
            {DEMO.map(([name, email]) => (
              <button key={email} type="button" className="btn btn-outline btn-sm" onClick={() => setForm({ email, password: 'password123' })}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <p className="center small mt muted">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
