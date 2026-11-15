'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Alert, Button, Empty, LoadingPage, Modal } from '@/components/ui';

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/teams').then(({ data }) => setTeams(data.teams)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/teams', form);
      router.push(`/admin/teams/${data.team.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Teams</h1>
          <p>Group students into classes or batches, invite them by email, and assign tests to a whole team.</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          + New team
        </button>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      {!teams ? (
        <LoadingPage />
      ) : !teams.length ? (
        <div className="card">
          <Empty icon="👥" title="No teams yet">
            Create a team, then invite students to it.
          </Empty>
        </div>
      ) : (
        <div className="grid grid-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/admin/teams/${t.id}`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <h3>{t.name}</h3>
              <p className="muted small" style={{ minHeight: 20 }}>
                {t.description || 'No description'}
              </p>
              <div className="row small">
                <span className="badge badge-primary">{t.studentCount} students</span>
                {t.pendingInvites > 0 && <span className="badge badge-warn">{t.pendingInvites} pending invites</span>}
                <span className="spacer" />
                <span className="muted">{fmtDate(t.createdAt, false)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New team">
        <form className="stack" onSubmit={create}>
          <label className="field">
            Team name
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Class 10 - Section B" />
          </label>
          <label className="field">
            Description
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <Button type="submit" loading={busy}>
            Create team
          </Button>
        </form>
      </Modal>
    </>
  );
}
