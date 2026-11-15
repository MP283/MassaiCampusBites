'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { Alert, Button, LoadingPage } from '@/components/ui';

export default function ChangePasswordPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);
  if (loading || !user) return <LoadingPage />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setOk('');
    if (form.newPassword !== form.confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setUser(data.user);
      setOk('Password updated. Redirecting…');
      setTimeout(() => router.replace(homeFor(data.user)), 900);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="center">{user.mustChangePassword ? 'Set a new password' : 'Change password'}</h1>
        {user.mustChangePassword && (
          <p className="center muted">Your account was created with a temporary password. Please choose your own to continue.</p>
        )}
        <Alert onClose={() => setError('')}>{error}</Alert>
        <Alert type="ok">{ok}</Alert>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            {user.mustChangePassword ? 'Temporary password' : 'Current password'}
            <input type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </label>
          <label className="field">
            New password
            <input type="password" required minLength={6} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </label>
          <label className="field">
            Confirm new password
            <input type="password" required minLength={6} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </label>
          <Button type="submit" loading={busy} className="btn-block btn-lg">
            Update password
          </Button>
          {!user.mustChangePassword && (
            <button type="button" className="btn btn-ghost" onClick={() => router.push(homeFor(user))}>
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
