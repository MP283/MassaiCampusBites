'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { Alert, Empty, LoadingPage, Stat } from '@/components/ui';
import { DistributionChart, PercentBarChart, SkillsRadar } from '@/components/Charts';

export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/analytics/overview').then(({ data }) => setData(data)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingPage />;
  const k = data.kpis;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Performance across all your tests and students.</p>
        </div>
      </div>
      <div className="grid grid-4">
        <Stat label="Submissions" value={k.submissions} />
        <Stat label="Average score" value={`${k.averagePercent}%`} />
        <Stat label="Active students" value={data.leaderboard.length} sub={`of ${k.students} enrolled`} />
        <Stat label="Awaiting review" value={k.needsReview} />
      </div>
      {!k.submissions ? (
        <div className="card mt">
          <Empty icon="📊" title="No data yet">
            Analytics appear once students submit tests.
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid grid-2 mt">
            <div className="card">
              <h3>Score distribution</h3>
              <DistributionChart data={data.distribution} />
            </div>
            <div className="card">
              <h3>Performance by question type</h3>
              <SkillsRadar data={data.types} labelKey="label" />
            </div>
          </div>
          <div className="card mt">
            <h3>Concept mastery</h3>
            <p className="small muted">Average score on questions tagged with each concept (weakest first).</p>
            <PercentBarChart data={data.concepts} labelKey="concept" horizontal height={Math.max(240, data.concepts.length * 34)} />
          </div>
          <div className="card mt table-wrap">
            <h3>Tests</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Attempts</th>
                  <th>Average</th>
                  <th>Highest</th>
                  <th>Lowest</th>
                </tr>
              </thead>
              <tbody>
                {data.perTest.map((t) => (
                  <tr key={t.testId}>
                    <td>
                      <Link href={`/admin/tests/${t.testId}`}>{t.title}</Link>
                    </td>
                    <td>{t.attempts}</td>
                    <td>
                      <b>{t.attempts ? `${t.average}%` : '—'}</b>
                    </td>
                    <td>{t.attempts ? `${t.highest}%` : '—'}</td>
                    <td>{t.attempts ? `${t.lowest}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
