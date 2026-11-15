'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, statusBadge } from '@/lib/format';
import { Alert, Badge, Empty, LoadingPage } from '@/components/ui';

export default function TestsPage() {
  const [tests, setTests] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/tests').then(({ data }) => setTests(data.tests)).catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tests</h1>
          <p>Create AI-generated tests, review the questions, assign and publish.</p>
        </div>
        <Link className="btn" href="/admin/tests/new">
          + New test
        </Link>
      </div>
      <Alert>{error}</Alert>
      <div className="card">
        {!tests ? (
          <LoadingPage />
        ) : !tests.length ? (
          <Empty icon="📝" title="No tests yet">
            <Link href="/admin/tests/new">Create your first test</Link>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Duration</th>
                  <th>Assigned</th>
                  <th>Submissions</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const b = statusBadge(t.status);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/admin/tests/${t.id}`}>
                          <b>{t.title}</b>
                        </Link>
                        {t.generatedWith && <div className="small muted">via {t.generatedWith === 'gemini' ? 'Gemini AI' : 'template generator'}</div>}
                      </td>
                      <td>
                        <Badge cls={b.cls}>{b.label}</Badge>
                      </td>
                      <td>{t.questionCount}</td>
                      <td>{fmtMarks(t.totalMarks)}</td>
                      <td className="nowrap">{t.duration} min</td>
                      <td>{t.assignedCount} students</td>
                      <td>{t.submissionCount}</td>
                      <td className="small muted nowrap">{fmtDate(t.createdAt, false)}</td>
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
