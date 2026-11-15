'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { errorMessage } from '@/lib/api';
import { useRequireRole } from '@/lib/auth';
import { TYPE_LABELS, fmtMarks } from '@/lib/format';
import { Alert, Button, LoadingPage, Modal } from '@/components/ui';

const AUTOSAVE_MS = 15000;

function isAnswered(q, a) {
  const r = a?.response;
  if (r === null || r === undefined) return false;
  if (q.type === 'match') return Array.isArray(r) && r.some((x) => x);
  if (typeof r === 'string') return r.trim().length > 0;
  return true;
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function ExamPage() {
  const { ready } = useRequireRole('student');
  const { id } = useParams();
  const router = useRouter();
  const [paper, setPaper] = useState(null);
  const [subId, setSubId] = useState(null);
  const [endsAt, setEndsAt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visited, setVisited] = useState(new Set());
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dirtyRef = useRef(false);
  const answersRef = useRef({});
  const offsetRef = useRef(0);
  const submittedRef = useRef(false);

  // ---- load paper + start / resume attempt
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [{ data: p }, { data: s }] = await Promise.all([api.get(`/tests/${id}/paper`), api.post(`/submissions/start/${id}`)]);
        setPaper(p.test);
        const sub = s.submission;
        setSubId(sub.id);
        offsetRef.current = new Date(sub.serverNow).getTime() - Date.now();
        setEndsAt(new Date(sub.endsAt).getTime());
        const map = {};
        sub.answers.forEach((a) => {
          map[a.questionId] = { response: a.response, markedForReview: a.markedForReview };
        });
        answersRef.current = map;
        setAnswers(map);
        setVisited(new Set([p.test.questions[0]?.id]));
      } catch (e) {
        if (e.response?.status === 409) {
          router.replace('/student');
          return;
        }
        setError(errorMessage(e));
      }
    })();
  }, [ready, id, router]);

  const payload = () => Object.entries(answersRef.current).map(([questionId, a]) => ({ questionId, response: a.response ?? null, markedForReview: !!a.markedForReview }));

  const save = useCallback(async () => {
    if (!subId || !dirtyRef.current || submittedRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      await api.put(`/submissions/${subId}/answers`, { answers: payload() });
      setSaveState('saved');
    } catch (e) {
      dirtyRef.current = true;
      setSaveState('error');
      if (e.response?.status === 409) router.replace('/student');
    }
  }, [subId, router]);

  const submit = useCallback(
    async (auto = false) => {
      if (submittedRef.current || !subId) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const { data } = await api.post(`/submissions/${subId}/submit`, { answers: payload() });
        router.replace(`/student/results/${data.submissionId}${auto ? '?auto=1' : ''}`);
      } catch (e) {
        if (e.response?.status === 409) {
          router.replace(`/student/results/${subId}`);
          return;
        }
        submittedRef.current = false;
        setSubmitting(false);
        setError(errorMessage(e));
      }
    },
    [subId, router]
  );

  // ---- autosave
  useEffect(() => {
    const t = setInterval(save, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [save]);

  // ---- timer
  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => {
      const left = endsAt - (Date.now() + offsetRef.current);
      setRemaining(left);
      if (left <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt, submit]);

  // ---- warn before leaving
  useEffect(() => {
    const h = (e) => {
      if (!submittedRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const questions = paper?.questions || [];
  const q = questions[current];

  const update = (qid, patch) => {
    const next = { ...answersRef.current, [qid]: { ...answersRef.current[qid], ...patch } };
    answersRef.current = next;
    dirtyRef.current = true;
    setSaveState('unsaved');
    setAnswers(next);
  };

  const go = (i) => {
    if (i < 0 || i >= questions.length) return;
    setCurrent(i);
    setVisited((v) => new Set(v).add(questions[i].id));
    save();
  };

  const stats = useMemo(() => {
    let answered = 0;
    let review = 0;
    questions.forEach((qq) => {
      if (isAnswered(qq, answers[qq.id])) answered += 1;
      if (answers[qq.id]?.markedForReview) review += 1;
    });
    return { answered, review, unanswered: questions.length - answered };
  }, [questions, answers]);

  if (!ready) return <LoadingPage />;
  if (error && !paper)
    return (
      <div className="main">
        <Alert>{error}</Alert>
        <button className="btn" onClick={() => router.replace('/student')}>
          Back to dashboard
        </button>
      </div>
    );
  if (!paper || !q) return <LoadingPage label="Preparing your test…" />;

  const a = answers[q.id] || {};
  const low = remaining !== null && remaining < 60000 * Math.min(5, Math.max(1, paper.duration * 0.1));
  const sectionStart = questions.findIndex((x) => x.section === q.section);

  return (
    <div className="exam">
      <header className="exam-top">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paper.title}</div>
          <div className="small muted">{paper.institution?.name}</div>
        </div>
        <span className="spacer" />
        <span className="small muted">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '⚠ Not saved — retrying' : 'Unsaved changes'}</span>
        <span className={`timer ${low ? 'low' : ''}`} aria-live="polite" title="Time remaining">
          ⏱ {remaining === null ? '--:--' : fmtClock(remaining)}
        </span>
        <button className="btn btn-ok" onClick={() => { save(); setConfirmOpen(true); }} disabled={submitting}>
          Submit test
        </button>
      </header>

      {error && (
        <div style={{ padding: '10px 24px 0' }}>
          <Alert onClose={() => setError('')}>{error}</Alert>
        </div>
      )}

      <div className="exam-body">
        <section className="card">
          <div className="row mb">
            <span className="badge badge-primary">{q.section}</span>
            <span className="badge badge-muted">{TYPE_LABELS[q.type]}</span>
            <span className="spacer" />
            <span className="small muted">
              Question {current + 1} of {questions.length} · {fmtMarks(q.marks)} mark{q.marks === 1 ? '' : 's'}
            </span>
          </div>
          {current === sectionStart && paper.sections.find((s) => s.name === q.section)?.instructions && (
            <Alert type="info">{paper.sections.find((s) => s.name === q.section).instructions}</Alert>
          )}
          <p className="question-text">
            <b>Q{current + 1}.</b> {q.text}
          </p>

          {q.type === 'mcq' &&
            q.options.map((o, i) => (
              <label key={i} className={`option ${a.response === i ? 'selected' : ''}`}>
                <input type="radio" name={`q-${q.id}`} checked={a.response === i} onChange={() => update(q.id, { response: i })} hidden />
                <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                <span>{o}</span>
              </label>
            ))}

          {q.type === 'fill_blank' && (
            <label className="field">
              Your answer
              <input type="text" value={a.response || ''} onChange={(e) => update(q.id, { response: e.target.value })} placeholder="Type the missing word(s)" autoFocus />
            </label>
          )}

          {q.type === 'match' && (
            <div className="stack">
              {q.left.map((l, i) => {
                const resp = Array.isArray(a.response) ? a.response : Array(q.left.length).fill(null);
                return (
                  <div key={i} className="pair-row" style={{ gridTemplateColumns: '1fr 1.4fr', alignItems: 'center' }}>
                    <div className="section-box" style={{ margin: 0 }}>
                      <b>{i + 1}.</b> {l}
                    </div>
                    <select
                      value={resp[i] || ''}
                      onChange={(e) => {
                        const next = [...resp];
                        next[i] = e.target.value || null;
                        update(q.id, { response: next });
                      }}
                      aria-label={`Match for ${l}`}
                    >
                      <option value="">— select match —</option>
                      {q.rightOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {(q.type === 'short' || q.type === 'long') && (
            <label className="field">
              Your answer
              <textarea rows={q.type === 'long' ? 12 : 5} value={a.response || ''} onChange={(e) => update(q.id, { response: e.target.value })} placeholder="Write your answer here…" />
              <span className="field-hint">{(a.response || '').trim().split(/\s+/).filter(Boolean).length} words</span>
            </label>
          )}

          <div className="row mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button className="btn btn-outline" onClick={() => go(current - 1)} disabled={current === 0}>
              ← Previous
            </button>
            <button className="btn btn-ghost" onClick={() => update(q.id, { response: null })}>
              Clear response
            </button>
            <span className="spacer" />
            <button className="btn btn-outline" onClick={() => { update(q.id, { markedForReview: !a.markedForReview }); if (!a.markedForReview) go(current + 1); }}>
              {a.markedForReview ? 'Unmark review' : 'Mark for review & next'}
            </button>
            {current < questions.length - 1 ? (
              <button className="btn" onClick={() => go(current + 1)}>
                Save &amp; next →
              </button>
            ) : (
              <button className="btn btn-ok" onClick={() => { save(); setConfirmOpen(true); }}>
                Finish
              </button>
            )}
          </div>
        </section>

        <aside className="stack">
          <div className="card">
            <h3>Question palette</h3>
            {paper.sections.map((s) => {
              const idx = questions.map((qq, i) => ({ qq, i })).filter(({ qq }) => qq.section === s.name);
              if (!idx.length) return null;
              return (
                <div key={s.name} className="mt">
                  <div className="small muted mb">{s.name}</div>
                  <div className="palette">
                    {idx.map(({ qq, i }) => {
                      const ans = isAnswered(qq, answers[qq.id]);
                      const rev = answers[qq.id]?.markedForReview;
                      const cls = [ans && 'answered', rev && 'review', visited.has(qq.id) && 'visited', i === current && 'current'].filter(Boolean).join(' ');
                      return (
                        <button key={qq.id} className={`pal-btn ${cls}`} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="legend mt">
              <span style={{ '--c': 'var(--ok)' }}>Answered ({stats.answered})</span>
              <span style={{ '--c': '#7c3aed' }}>For review ({stats.review})</span>
              <span style={{ '--c': 'var(--danger-50)' }}>Not answered</span>
              <span style={{ '--c': 'var(--surface)' }}>Not visited</span>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit test?">
        <div className="grid grid-3 mb">
          <div className="center">
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{stats.answered}</div>
            <div className="small muted">Answered</div>
          </div>
          <div className="center">
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.unanswered}</div>
            <div className="small muted">Not answered</div>
          </div>
          <div className="center">
            <div className="stat-value" style={{ color: '#7c3aed' }}>{stats.review}</div>
            <div className="small muted">Marked for review</div>
          </div>
        </div>
        <p className="muted">Once submitted you cannot change your answers. Time remaining: {remaining === null ? '—' : fmtClock(remaining)}.</p>
        <div className="row">
          <span className="spacer" />
          <button className="btn btn-outline" onClick={() => setConfirmOpen(false)}>
            Keep working
          </button>
          <Button className="btn-ok" loading={submitting} onClick={() => submit(false)}>
            Submit now
          </Button>
        </div>
      </Modal>
      {submitting && !confirmOpen && (
        <div className="modal-backdrop">
          <div className="modal center">
            <span className="spinner" />
            <p className="mt">Submitting and grading your answers…</p>
          </div>
        </div>
      )}
    </div>
  );
}
