import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { HOME, useAuth } from '../context/AuthContext';
import { Alert, Button } from '../components/ui';

const ROLES = [
  ['customer', '🍽️', 'Customer', 'Order food'],
  ['owner', '👨‍🍳', 'Restaurant owner', 'Sell food'],
  ['delivery', '🛵', 'Delivery partner', 'Deliver orders'],
];

export default function Register() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'customer', phone: '', address: '', restaurant_name: '', cuisine: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (user) return <Navigate to={HOME[user.role]} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { confirm, ...body } = form;
      if (body.role !== 'owner') {
        delete body.restaurant_name;
        delete body.cuisine;
      }
      const { data } = await api.post('/auth/register', body);
      login(data.access_token, data.user);
      navigate(HOME[data.user.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Registration failed'));
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: 560 }}>
        <h1 className="center">Create your account</h1>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <form className="stack" onSubmit={submit}>
          <div className="grid grid-3" style={{ gap: 8 }}>
            {ROLES.map(([value, icon, title, sub]) => (
              <label key={value} className={`option ${form.role === value ? 'selected' : ''}`} style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 0 }}>
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} hidden />
                <span style={{ fontSize: '1.6rem' }}>{icon}</span>
                <b className="small">{title}</b>
                <span className="small muted">{sub}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-2">
            <label className="field">Full name<input type="text" required minLength={2} value={form.name} onChange={set('name')} /></label>
            <label className="field">Phone<input type="text" value={form.phone} onChange={set('phone')} placeholder="98765 43210" /></label>
          </div>
          <label className="field">Email<input type="email" required value={form.email} onChange={set('email')} /></label>
          {form.role === 'owner' && (
            <div className="grid grid-2">
              <label className="field">Restaurant name<input type="text" required value={form.restaurant_name} onChange={set('restaurant_name')} /></label>
              <label className="field">Cuisine<input type="text" value={form.cuisine} onChange={set('cuisine')} placeholder="e.g. South Indian" /></label>
            </div>
          )}
          <label className="field">
            {form.role === 'owner' ? 'Restaurant address' : 'Address'}
            <input type="text" value={form.address} onChange={set('address')} placeholder={form.role === 'customer' ? 'Hostel / room number' : ''} />
          </label>
          <div className="grid grid-2">
            <label className="field">Password<input type="password" required minLength={6} value={form.password} onChange={set('password')} /></label>
            <label className="field">Confirm password<input type="password" required minLength={6} value={form.confirm} onChange={set('confirm')} /></label>
          </div>
          <Button type="submit" loading={busy} className="btn-block btn-lg">Sign up</Button>
        </form>
        <p className="center small mt muted">Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
