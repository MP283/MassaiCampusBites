'use client';

import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { Alert, Badge, Empty, LoadingPage } from '@/components/ui';

export default function StudentsPage() {
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');

  const load = () => api.get('/students').then(({ data }) => setStudents(data.students)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, []);

  async function resetPw(s) {
    if (!confirm(`Reset ${s.name}'s password? They will get a temporary password.`)) return;
    try {
      const { data } = await api.post(`/students/${s.id}/reset-password`);
      setNotice(`Temporary password for ${s.email}: ${data.tempPassword}${data.emailSent ? ' (also emailed)' : ''}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(s) {
    if (!confirm(`Permanently delete ${s.name} and all their submissions?`)) return;
    try {
      await api.delete(`/students/${s.id}`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const filtered = (students || []).filter((s) => `${s.name} ${s.email} ${s.teams.join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <p>Everyone who has joined one of your teams.</p>
        </div>
        <input type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} aria-label="Search students" />
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="info" onClose={() => setNotice('')}>
        {notice}
      </Alert>
      <div className="card">
        {!students ? (
          <LoadingPage />
        ) : !filtered.length ? (
          <Empty icon="🎓" title={students.length ? 'No matches' : 'No students yet'}>
            {!students.length && 'Invite students from a team page.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Teams</th>
                  <th>Tests taken</th>
                  <th>Average</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <div className="small muted">{s.email}</div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {s.teams.map((t) => (
                          <Badge key={t} cls="badge-primary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td>{s.testsTaken}</td>
                    <td>{s.averagePercent == null ? '—' : <b>{s.averagePercent}%</b>}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => resetPw(s)}>
                        Reset password
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(s)} aria-label="Delete student">
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
