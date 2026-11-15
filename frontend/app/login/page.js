'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { Alert, Button } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('expired=1')) setInfo('Your session expired. Please log in again.');
  }, []);
  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user));
  }, [user, loading, router]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, data.user);
      router.replace(homeFor(data.user));
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
      setBusy(false);
    }
  }

  const demo = (email) => setForm({ email, password: 'password123' });

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">AI</span> TestGen
        </Link>
        <h1 className="center">Welcome back</h1>
        <p className="center muted">Log in as an admin or a student</p>
        <Alert type="info">{info}</Alert>
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
          <Button type="submit" loading={busy} className="btn-block btn-lg">
            Log in
          </Button>
        </form>
        <div className="row mt small" style={{ justifyContent: 'center' }}>
          <span className="muted">Try the demo:</span>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => demo('admin@demo.com')}>
            Admin
          </button>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => demo('student@demo.com')}>
            Student
          </button>
        </div>
        <p className="center small mt muted">
          New institution? <Link href="/register">Create an admin account</Link>
          <br />
          Students: use the invitation link from your email.
        </p>
      </div>
    </div>
  );
}
