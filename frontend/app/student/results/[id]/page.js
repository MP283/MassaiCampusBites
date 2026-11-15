'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, pct } from '@/lib/format';
import { Alert, LoadingPage, ScoreRing, Stat } from '@/components/ui';
import ResultView from '@/components/ResultView';

export default function ResultPage() {
  const { id } = useParams();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    setAuto(typeof window !== 'undefined' && window.location.search.includes('auto=1'));
    api.get(`/submissions/${id}`).then(({ data }) => setSub(data.submission)).catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!sub) return <LoadingPage />;

  const p = pct(sub.totalScore, sub.maxScore);
  const correct = sub.questions.filter((q) => q.isCorrect).length;
  const unanswered = sub.questions.filter((q) => q.response == null || q.response === '' || (Array.isArray(q.response) && !q.response.some(Boolean))).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small mb">
            <Link href="/student">← My tests</Link>
          </div>
          <h1>{sub.testTitle}</h1>
          <p>
            Submitted {fmtDate(sub.submittedAt)} · {sub.mode === 'offline' ? 'answer sheet upload' : 'online'}
          </p>
        </div>
      </div>
      {auto && <Alert type="warn">Time ran out, so your test was submitted automatically with the answers saved so far.</Alert>}
      {sub.needsReview && (
        <Alert type="info">
          Some answers are waiting for your teacher to review. The score shown is provisional and may change.
        </Alert>
      )}

      <div className="card row" style={{ gap: 28 }}>
        <ScoreRing percent={p} label={sub.needsReview ? 'provisional' : 'score'} />
        <div className="spacer stack" style={{ gap: 8 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
            {fmtMarks(sub.totalScore)} <span className="muted" style={{ fontSize: '1.1rem', fontWeight: 500 }}>/ {fmtMarks(sub.maxScore)} marks</span>
          </div>
          {sub.overallFeedback && <p style={{ margin: 0 }}>{sub.overallFeedback}</p>}
          <Link href="/student/analytics" className="small">
            See your overall performance →
          </Link>
        </div>
      </div>

      <div className="grid grid-3 mt">
        <Stat label="Correct" value={correct} sub={`of ${sub.questions.length} questions`} />
        <Stat label="Unanswered" value={unanswered} />
        <Stat label="Accuracy" value={`${sub.questions.length ? Math.round((100 * correct) / sub.questions.length) : 0}%`} />
      </div>

      <h2 className="mt" style={{ marginTop: 28 }}>
        Answer review
      </h2>
      <ResultView submission={sub} />
    </>
  );
}
