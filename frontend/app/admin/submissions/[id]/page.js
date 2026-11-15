'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, pct, statusBadge } from '@/lib/format';
import { Alert, Badge, Button, LoadingPage, ScoreRing } from '@/components/ui';
import ResultView from '@/components/ResultView';

export default function SubmissionReviewPage() {
  const { id } = useParams();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [grades, setGrades] = useState({});
  const [overall, setOverall] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/submissions/${id}`)
      .then(({ data }) => {
        setSub(data.submission);
        setOverall(data.submission.overallFeedback || '');
        if (data.submission.needsReview) setEditing(true);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const answers = sub.questions.map((q) => ({
        questionId: q.id,
        score: Number(grades[q.id]?.score ?? q.score),
        feedback: grades[q.id]?.feedback ?? q.feedback ?? '',
      }));
      const { data } = await api.put(`/submissions/${id}/grade`, { answers, overallFeedback: overall });
      setSub(data.submission);
      setGrades({});
      setEditing(false);
      setNotice('Grades saved. The student can now see the final result.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !sub) return <Alert>{error}</Alert>;
  if (!sub) return <LoadingPage />;
  const b = statusBadge(sub.status, sub.needsReview);
  const liveTotal = sub.questions.reduce((n, q) => n + Number(grades[q.id]?.score ?? q.score), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small mb">
            <Link href={`/admin/tests/${sub.testId}`}>← {sub.testTitle}</Link>
          </div>
          <h1>{sub.studentName}</h1>
          <div className="row small muted">
            <span>{sub.studentEmail}</span>·<Badge cls={b.cls}>{b.label}</Badge>
            <Badge>{sub.mode}</Badge>
            <span>Submitted {fmtDate(sub.submittedAt)}</span>
            {sub.autoSubmitted && <Badge cls="badge-warn">auto-submitted at time limit</Badge>}
          </div>
        </div>
        {!editing && (
          <button className="btn btn-outline" onClick={() => setEditing(true)}>
            ✏️ Adjust grades
          </button>
        )}
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="ok" onClose={() => setNotice('')}>
        {notice}
      </Alert>
      {sub.needsReview && (
        <Alert type="warn">
          Some answers were scored provisionally (no AI grading available). Check the scores below and save to finalise.
        </Alert>
      )}

      <div className="card row mb" style={{ gap: 24 }}>
        <ScoreRing percent={pct(editing ? liveTotal : sub.totalScore, sub.maxScore)} />
        <div className="spacer stack" style={{ gap: 6 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {fmtMarks(editing ? liveTotal : sub.totalScore)} / {fmtMarks(sub.maxScore)}
          </div>
          {editing ? (
            <label className="field">
              Overall feedback
              <textarea rows={2} value={overall} onChange={(e) => setOverall(e.target.value)} />
            </label>
          ) : (
            sub.overallFeedback && <p style={{ margin: 0 }}>{sub.overallFeedback}</p>
          )}
        </div>
      </div>

      <ResultView
        submission={sub}
        grading={editing ? grades : null}
        onGradeChange={(qid, patch) => setGrades((g) => ({ ...g, [qid]: { ...g[qid], ...patch } }))}
      />

      {editing && (
        <div className="card row mt" style={{ position: 'sticky', bottom: 12 }}>
          <span className="spacer small muted">Total: {fmtMarks(liveTotal)} / {fmtMarks(sub.maxScore)}</span>
          {!sub.needsReview && (
            <button className="btn btn-outline" onClick={() => { setEditing(false); setGrades({}); }}>
              Cancel
            </button>
          )}
          <Button loading={busy} onClick={save}>
            Save grades
          </Button>
        </div>
      )}
    </>
  );
}
