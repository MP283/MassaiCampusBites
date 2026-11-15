'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, statusBadge } from '@/lib/format';
import { Alert, Badge, Empty, LoadingPage, Stat } from '@/components/ui';
import { DistributionChart, PercentBarChart } from '@/components/Charts';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/overview').then(({ data }) => setData(data)).catch((e) => setError(errorMessage(e)));
    api.get('/health').then(({ data }) => setHealth(data)).catch(() => {});
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingPage />;
  const k = data.kpis;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {user.name.split(' ')[0]} 👋</h1>
          <p>{user.institution?.name || 'Your workspace'} · overview of your tests and students</p>
        </div>
        <div className="row">
          <Link className="btn btn-outline" href="/admin/uploads">
            Upload content
          </Link>
          <Link className="btn" href="/admin/tests/new">
            + New test
          </Link>
        </div>
      </div>

      {health && (!health.gemini || health.database === 'memory') && (
        <Alert type="warn">
          {health.database === 'memory' && (
            <div>
              <b>In-memory database:</b> data resets when the backend restarts. Install MongoDB and restart to keep data.
            </div>
          )}
          {!health.gemini && (
            <div>
              <b>No Gemini API key:</b> questions come from the offline template generator. Add <code>GEMINI_API_KEY</code> to{' '}
              <code>backend/.env</code> for real AI questions and AI grading.
            </div>
          )}
        </Alert>
      )}

      <div className="grid grid-4">
        <Stat label="Students" value={k.students} sub={`${k.teams} team${k.teams === 1 ? '' : 's'}`} icon="🎓" />
        <Stat label="Tests" value={k.tests} sub={`${k.published} published`} icon="📝" />
        <Stat label="Submissions" value={k.submissions} sub={k.needsReview ? `${k.needsReview} awaiting review` : 'all graded'} icon="📥" />
        <Stat label="Average score" value={`${k.averagePercent}%`} sub="across all submissions" icon="🎯" />
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <div className="card-head">
            <h3>Score distribution</h3>
          </div>
          {k.submissions ? <DistributionChart data={data.distribution} /> : <Empty icon="📊" title="No submissions yet" />}
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Average by test</h3>
          </div>
          {data.perTest.some((t) => t.attempts) ? (
            <PercentBarChart data={data.perTest.filter((t) => t.attempts)} labelKey="title" valueKey="average" />
          ) : (
            <Empty icon="📝" title="No attempts yet" />
          )}
        </div>
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <div className="card-head">
            <h3>Recent submissions</h3>
            <Link href="/admin/tests" className="small">
              All tests →
            </Link>
          </div>
          {data.recent.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {data.recent.map((r) => {
                    const b = statusBadge(r.status, r.needsReview);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/admin/submissions/${r.id}`}>
                            <b>{r.studentName}</b>
                          </Link>
                          <div className="small muted">{r.testTitle}</div>
                        </td>
                        <td className="nowrap">
                          <b>{r.percent}%</b>
                        </td>
                        <td>
                          <Badge cls={b.cls}>{b.label}</Badge>
                        </td>
                        <td className="small muted nowrap">{fmtDate(r.submittedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="📥" title="Nothing yet">
              Publish a test and assign it to a team.
            </Empty>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Top students</h3>
          </div>
          {data.leaderboard.length ? (
            <table className="table">
              <tbody>
                {data.leaderboard.map((s, i) => (
                  <tr key={s.studentId}>
                    <td style={{ width: 36 }}>{['🥇', '🥈', '🥉'][i] || i + 1}</td>
                    <td>
                      <b>{s.name}</b>
                      <div className="small muted">{s.tests} test(s)</div>
                    </td>
                    <td style={{ width: '40%' }}>
                      <div className="progress">
                        <div style={{ width: `${s.average}%` }} />
                      </div>
                    </td>
                    <td className="nowrap">
                      <b>{s.average}%</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty icon="🏆" title="No results yet" />
          )}
        </div>
      </div>

      {data.concepts.length > 0 && (
        <div className="card mt">
          <div className="card-head">
            <h3>Weakest concepts (class-wide)</h3>
            <span className="small muted">Lowest average first</span>
          </div>
          <PercentBarChart data={data.concepts.slice(0, 8)} labelKey="concept" horizontal height={Math.max(200, data.concepts.slice(0, 8).length * 40)} />
        </div>
      )}
    </>
  );
}
