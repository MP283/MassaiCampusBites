'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, LoadingPage } from '@/components/ui';

export default function InvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const { login } = useAuth();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/auth/invite/${token}`)
      .then(({ data }) => {
        setInfo(data);
        setForm((f) => ({ ...f, name: data.name || '' }));
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!info.accountExists && form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/accept-invite', { token, name: form.name || info.email.split('@')[0], password: form.password });
      login(data.token, data.user);
      router.replace('/student');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="auth-wrap">
        <div className="card auth-card center">
          <h1>Invitation not found</h1>
          <p className="muted">{loadError}</p>
          <a className="btn" href="/login">
            Go to login
          </a>
        </div>
      </div>
    );
  if (!info) return <LoadingPage />;

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand">
          <span className="brand-mark">AI</span> TestGen
        </div>
        <h1 className="center">Join {info.teamName}</h1>
        <p className="center muted">
          {info.adminName}
          {info.institution ? ` · ${info.institution}` : ''} invited <b>{info.email}</b>
        </p>
        {info.status === 'accepted' && <Alert type="info">This invitation was already accepted. Log in to continue.</Alert>}
        <Alert onClose={() => setError('')}>{error}</Alert>
        <form className="stack" onSubmit={submit}>
          {!info.accountExists && (
            <label className="field">
              Your full name
              <input type="text" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
          )}
          <label className="field">
            {info.accountExists ? 'Your existing password' : 'Choose a password'}
            <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {!info.accountExists && (
            <label className="field">
              Confirm password
              <input type="password" required minLength={6} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </label>
          )}
          <Button type="submit" loading={busy} className="btn-block btn-lg">
            {info.accountExists ? 'Join team' : 'Create account & join'}
          </Button>
        </form>
      </div>
    </div>
  );
}
