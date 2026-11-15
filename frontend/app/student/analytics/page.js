'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks } from '@/lib/format';
import { Alert, Empty, LoadingPage, Stat } from '@/components/ui';
import { PercentBarChart, SkillsRadar, TrendChart } from '@/components/Charts';

export default function StudentAnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/analytics/me').then(({ data }) => setData(data)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingPage />;
  const k = data.kpis;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My performance</h1>
          <p>Track your progress, strengths and topics to work on.</p>
        </div>
      </div>
      <div className="grid grid-4">
        <Stat label="Tests taken" value={k.testsTaken} sub={`${k.pending} pending`} icon="📝" />
        <Stat label="Average score" value={`${k.averagePercent}%`} icon="🎯" />
        <Stat label="Best score" value={`${k.bestPercent}%`} icon="🏆" />
        <Stat label="Question accuracy" value={`${k.accuracy}%`} sub="questions answered fully correctly" icon="✅" />
      </div>

      {!k.testsTaken ? (
        <div className="card mt">
          <Empty icon="📊" title="No results yet">
            Complete a test to see your analytics.
          </Empty>
        </div>
      ) : (
        <>
          <div className="card mt">
            <h3>Score trend vs class average</h3>
            <TrendChart data={data.trend} />
          </div>
          <div className="grid grid-2 mt">
            <div className="card">
              <h3>By question type</h3>
              <SkillsRadar data={data.types} labelKey="label" />
            </div>
            <div className="card">
              <h3>Strengths &amp; focus areas</h3>
              <div className="stack mt">
                <div>
                  <div className="small muted mb">💪 Strong (≥ 75%)</div>
                  <div className="row" style={{ gap: 6 }}>
                    {data.strengths.length ? data.strengths.map((s) => <span key={s} className="badge badge-ok">{s}</span>) : <span className="small muted">Keep practising!</span>}
                  </div>
                </div>
                <div>
                  <div className="small muted mb">🎯 Needs work (&lt; 50%)</div>
                  <div className="row" style={{ gap: 6 }}>
                    {data.weaknesses.length ? data.weaknesses.map((s) => <span key={s} className="badge badge-danger">{s}</span>) : <span className="small muted">Nothing below 50% 🎉</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card mt">
            <h3>Concept mastery</h3>
            <PercentBarChart data={data.concepts} labelKey="concept" horizontal height={Math.max(220, data.concepts.length * 34)} />
          </div>
          <div className="card mt table-wrap">
            <h3>History</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Date</th>
                  <th>Score</th>
                  <th>Class avg</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...data.trend].reverse().map((t) => (
                  <tr key={t.submissionId}>
                    <td>
                      <b>{t.title}</b>
                    </td>
                    <td className="small muted">{fmtDate(t.date)}</td>
                    <td>
                      {fmtMarks(t.score)}/{fmtMarks(t.max)} <b>({t.percent}%)</b>
                    </td>
                    <td>{t.classAverage}%</td>
                    <td>
                      <Link href={`/student/results/${t.submissionId}`} className="btn btn-outline btn-sm">
                        Review
                      </Link>
                    </td>
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
