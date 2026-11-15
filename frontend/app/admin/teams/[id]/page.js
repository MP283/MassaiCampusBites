'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Alert, Badge, Button, Empty, LoadingPage } from '@/components/ui';

function parseEntries(text) {
  // Accepts lines like "email", "Name <email>", "Name, email" or "email, Name"
  return text
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const angle = line.match(/^(.*)<([^>]+)>$/);
      if (angle) return { name: angle[1].trim().replace(/,$/, ''), email: angle[2].trim() };
      const parts = line.split(',').map((p) => p.trim());
      const email = parts.find((p) => p.includes('@')) || parts[0];
      const name = parts.find((p) => p !== email) || '';
      return { name, email };
    });
}

export default function TeamDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('invite');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(() => api.get(`/teams/${id}`).then(({ data }) => setTeam(data.team)).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function invite(e) {
    e.preventDefault();
    const students = parseEntries(text);
    if (!students.length) return setError('Enter at least one email address.');
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/teams/${id}/invite`, { students, mode });
      setResults(data.results);
      setTeam(data.team);
      setText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn) {
    try {
      const { data } = await fn();
      if (data.team) setTeam(data.team);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeTeam() {
    if (!confirm(`Delete team "${team.name}"? Students keep their accounts.`)) return;
    await api.delete(`/teams/${id}`);
    router.push('/admin/teams');
  }

  const copy = (link) => {
    navigator.clipboard?.writeText(link);
    setCopied(link);
    setTimeout(() => setCopied(''), 1500);
  };

  if (error && !team) return <Alert>{error}</Alert>;
  if (!team) return <LoadingPage />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small mb">
            <Link href="/admin/teams">← Teams</Link>
          </div>
          <h1>{team.name}</h1>
          <p>{team.description || `${team.students.length} students`}</p>
        </div>
        <button className="btn btn-ghost" onClick={removeTeam}>
          🗑 Delete team
        </button>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="grid grid-2">
        <div className="card">
          <h3>Add students</h3>
          <form className="stack mt" onSubmit={invite}>
            <label className="field">
              Emails <span className="field-hint">One per line. Optionally add a name: &quot;Riya Sharma, riya@school.com&quot;</span>
              <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'riya@school.com\nAarav Patel, aarav@school.com'} />
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
                Email an invitation link (students set their own password)
              </label>
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'credentials'} onChange={() => setMode('credentials')} />
                Create accounts now with temporary passwords
              </label>
            </div>
            <Button type="submit" loading={busy}>
              {mode === 'invite' ? 'Send invitations' : 'Create accounts'}
            </Button>
          </form>
          {results && (
            <div className="mt">
              <h3>Results</h3>
              <div className="stack" style={{ gap: 6 }}>
                {results.map((r, i) => (
                  <div key={i} className="section-box small">
                    <div className="row">
                      <b className="spacer">{r.email}</b>
                      <Badge cls={r.status === 'error' ? 'badge-danger' : 'badge-ok'}>{r.status}</Badge>
                    </div>
                    <div className="muted">{r.message}</div>
                    {r.tempPassword && (
                      <div>
                        Temporary password: <code>{r.tempPassword}</code>
                      </div>
                    )}
                    {r.link && !r.emailSent && (
                      <button className="btn btn-outline btn-sm mt" onClick={() => copy(r.link)}>
                        {copied === r.link ? 'Copied!' : 'Copy invite link'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Members</h3>
              <span className="badge badge-primary">{team.students.length}</span>
            </div>
            {team.students.length === 0 ? (
              <Empty icon="🎓" title="No members yet" />
            ) : (
              <table className="table">
                <tbody>
                  {team.students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <b>{s.name}</b>
                        <div className="small muted">{s.email}</div>
                      </td>
                      <td>{s.mustChangePassword && <Badge cls="badge-warn">temp password</Badge>}</td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => confirm(`Remove ${s.name} from this team?`) && act(() => api.delete(`/teams/${id}/students/${s.id}`))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3>Invitations</h3>
            {team.invites.length === 0 ? (
              <p className="muted small">No invitations sent.</p>
            ) : (
              <table className="table">
                <tbody>
                  {team.invites.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <b>{inv.email}</b>
                        <div className="small muted">sent {fmtDate(inv.sentAt)}</div>
                      </td>
                      <td>
                        <Badge cls={inv.status === 'accepted' ? 'badge-ok' : 'badge-warn'}>{inv.status}</Badge>
                      </td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        {inv.status === 'pending' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => copy(inv.link)}>
                              {copied === inv.link ? 'Copied!' : 'Copy link'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.delete(`/teams/${id}/invites/${inv.id}`))}>
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
