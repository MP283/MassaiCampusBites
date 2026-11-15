'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtMarks, pct, statusBadge } from '@/lib/format';
import { Alert, Badge, Empty, LoadingPage, Stat } from '@/components/ui';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [tests, setTests] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/tests/assigned').then(({ data }) => setTests(data.tests)).catch((e) => setError(errorMessage(e)));
    api.get('/analytics/me').then(({ data }) => setKpis(data.kpis)).catch(() => {});
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!tests) return <LoadingPage />;

  const pending = tests.filter((t) => !t.submission || t.submission.status === 'in_progress');
  const done = tests.filter((t) => t.submission && t.submission.status !== 'in_progress');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi, {user.name.split(' ')[0]} 👋</h1>
          <p>Your assigned tests and results.</p>
        </div>
      </div>
      {kpis && (
        <div className="grid grid-4 mb">
          <Stat label="Pending tests" value={pending.length} icon="⏳" />
          <Stat label="Completed" value={kpis.testsTaken} icon="✅" />
          <Stat label="Average score" value={`${kpis.averagePercent}%`} icon="🎯" />
          <Stat label="Best score" value={`${kpis.bestPercent}%`} icon="🏆" />
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>To do</h2>
        </div>
        {!pending.length ? (
          <Empty icon="🎉" title="You're all caught up">
            New tests from your teacher will appear here.
          </Empty>
        ) : (
          <div className="grid grid-2">
            {pending.map((t) => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !t.submission;
              return (
                <div key={t.id} className="section-box stack" style={{ gap: 8 }}>
                  <div className="row">
                    <h3 className="spacer" style={{ margin: 0 }}>
                      {t.title}
                    </h3>
                    {t.submission?.status === 'in_progress' && <Badge cls="badge-warn">In progress</Badge>}
                    {overdue && <Badge cls="badge-danger">Overdue</Badge>}
                  </div>
                  <div className="small muted">
                    {t.institution && `${t.institution} · `}
                    {t.questionCount} questions · {fmtMarks(t.totalMarks)} marks · {t.duration} min
                    {t.dueDate && ` · due ${fmtDate(t.dueDate)}`}
                  </div>
                  <div className="row">
                    <Link className="btn" href={`/student/tests/${t.id}`}>
                      {t.submission?.status === 'in_progress' ? 'Resume test' : 'Start'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Completed</h2>
          <Link href="/student/analytics" className="small">
            See performance →
          </Link>
        </div>
        {!done.length ? (
          <Empty icon="📄" title="No completed tests yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Mode</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {done.map((t) => {
                  const s = t.submission;
                  const b = statusBadge(s.status, s.needsReview);
                  return (
                    <tr key={t.id}>
                      <td>
                        <b>{t.title}</b>
                      </td>
                      <td>
                        <Badge>{s.mode}</Badge>
                      </td>
                      <td className="nowrap">
                        <b>{fmtMarks(s.totalScore)}</b> / {fmtMarks(s.maxScore)} ({pct(s.totalScore, s.maxScore)}%)
                      </td>
                      <td>
                        <Badge cls={b.cls}>{b.label}</Badge>
                      </td>
                      <td className="small muted nowrap">{fmtDate(s.submittedAt)}</td>
                      <td>
                        <Link className="btn btn-outline btn-sm" href={`/student/results/${s.id}`}>
                          View result
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
