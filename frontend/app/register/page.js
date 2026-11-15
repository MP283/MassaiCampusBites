'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button } from '@/components/ui';

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', institutionName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { confirm, ...body } = form;
      const { data } = await api.post('/auth/register-admin', body);
      login(data.token, data.user);
      router.replace('/admin');
    } catch (err) {
      setError(errorMessage(err, 'Registration failed'));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">AI</span> TestGen
        </Link>
        <h1 className="center">Create admin account</h1>
        <p className="center muted">For teachers, institutions and self-learners</p>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Your name
            <input type="text" required minLength={2} value={form.name} onChange={set('name')} />
          </label>
          <label className="field">
            Institution name <span className="field-hint">Shown on branded test papers (optional)</span>
            <input type="text" value={form.institutionName} onChange={set('institutionName')} placeholder="e.g. Bright Future Academy" />
          </label>
          <label className="field">
            Email
            <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              Password
              <input type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
            </label>
            <label className="field">
              Confirm
              <input type="password" required minLength={6} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
            </label>
          </div>
          <Button type="submit" loading={busy} className="btn-block btn-lg">
            Create account
          </Button>
        </form>
        <p className="center small mt muted">
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
