'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { authedUrl, errorMessage } from '@/lib/api';
import { fmtDate, fmtMarks, statusBadge } from '@/lib/format';
import { Alert, Badge, Button, Empty, LoadingPage, Stat } from '@/components/ui';
import QuestionEditor from '@/components/QuestionEditor';
import TestConfigForm, { configPayload, toLocalInput } from '@/components/TestConfigForm';
import { DistributionChart, PercentBarChart } from '@/components/Charts';

const TABS = [
  ['questions', 'Questions'],
  ['assign', 'Assign & publish'],
  ['settings', 'Settings'],
  ['submissions', 'Submissions'],
  ['analytics', 'Analytics'],
];

export default function TestDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [test, setTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('questions');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [subCount, setSubCount] = useState(0);

  const apply = useCallback((t) => {
    setTest(t);
    setQuestions(t.questions);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const [{ data }, subs] = await Promise.all([api.get(`/tests/${id}`), api.get(`/submissions/test/${id}`)]);
      apply(data.test);
      setSubCount(subs.data.submissions.length);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, apply]);

  useEffect(() => {
    load();
    try {
      const w = sessionStorage.getItem(`gen-warning-${id}`);
      if (w) {
        setNotice(w);
        sessionStorage.removeItem(`gen-warning-${id}`);
      }
    } catch {
      /* ignore */
    }
  }, [id, load]);

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function run(label, fn, success) {
    setError('');
    setNotice('');
    setBusy(label);
    try {
      const res = await fn();
      if (res?.data?.test) apply(res.data.test);
      if (res?.data?.warning) setNotice(res.data.warning);
      else if (success) setNotice(success);
      return res;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy('');
    }
  }

  if (error && !test) return <Alert>{error}</Alert>;
  if (!test) return <LoadingPage />;

  const locked = subCount > 0;
  const b = statusBadge(test.status);
  const sections = test.sections.map((s) => s.name);
  const totalMarks = questions.reduce((n, q) => n + Number(q.marks || 0), 0);

  const regenerate = () => {
    if (questions.length && !confirm('Replace all current questions with newly generated ones?')) return;
    run('generate', () => api.post(`/tests/${id}/generate`), 'New questions generated.');
  };
  const save = () =>
    run('save', () => api.put(`/tests/${id}/questions`, { questions: questions.map((q) => ({ ...q, marks: Number(q.marks) })) }), 'Questions saved.');
  const rescale = () => {
    const target = prompt('Rescale marks so the paper totals:', String(test.totalMarks));
    if (!target) return;
    run('save', () => api.put(`/tests/${id}/questions`, { questions, rescaleTo: Number(target) }), `Marks rescaled to ${target}.`);
  };
  const togglePublish = () => {
    if (dirty) return setError('Save your question changes before publishing.');
    run('publish', () => api.post(`/tests/${id}/publish`, { publish: test.status !== 'published' }),
      test.status === 'published' ? 'Test moved back to draft.' : 'Test published! Assigned students can now take it.');
  };
  const remove = async () => {
    if (!confirm(`Delete "${test.title}" and all its submissions? This cannot be undone.`)) return;
    const res = await run('delete', () => api.delete(`/tests/${id}`));
    if (res) router.push('/admin/tests');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row small mb">
            <Link href="/admin/tests">← Tests</Link>
          </div>
          <h1>{test.title}</h1>
          <div className="row small muted">
            <Badge cls={b.cls}>{b.label}</Badge>
            <span>{questions.length} questions</span>·<span>{fmtMarks(test.totalMarks)} marks</span>·<span>{test.duration} min</span>·
            <span style={{ textTransform: 'capitalize' }}>{test.difficulty}</span>
            {test.generatedWith && <span>· generated with {test.generatedWith === 'gemini' ? 'Gemini AI' : 'template generator'}</span>}
          </div>
        </div>
        <div className="row">
          <a className="btn btn-outline" href={authedUrl(`/tests/${id}/pdf`)} target="_blank" rel="noreferrer">
            🖨 Question paper
          </a>
          <a className="btn btn-outline" href={authedUrl(`/tests/${id}/pdf?answers=true`)} target="_blank" rel="noreferrer">
            🔑 Answer key
          </a>
          <Button loading={busy === 'publish'} className={test.status === 'published' ? 'btn-outline' : 'btn-ok'} onClick={togglePublish}>
            {test.status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
          <button className="btn btn-ghost" onClick={remove} aria-label="Delete test">
            🗑
          </button>
        </div>
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type={notice.toLowerCase().includes('fail') || notice.includes('No GEMINI') ? 'warn' : 'ok'} onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>
            {label}
            {k === 'submissions' && subCount ? ` (${subCount})` : ''}
            {k === 'questions' && dirty ? ' •' : ''}
          </button>
        ))}
      </div>

      {tab === 'questions' && (
        <>
          <div className="card row" style={{ position: 'sticky', top: 8, zIndex: 5 }}>
            <span className="small muted spacer">
              {locked ? '🔒 Questions are locked because students have already attempted this test.' : dirty ? 'You have unsaved changes.' : 'Edit any question, then save.'}{' '}
              Current total: <b>{fmtMarks(totalMarks)}</b> marks.
            </span>
            {!locked && (
              <>
                <Button className="btn-outline" loading={busy === 'generate'} disabled={!!busy} onClick={regenerate}>
                  ✨ {questions.length ? 'Regenerate' : 'Generate'} with AI
                </Button>
                <Button className="btn-outline" disabled={!!busy || !questions.length} onClick={rescale}>
                  Rescale marks
                </Button>
                <Button loading={busy === 'save'} disabled={!dirty || !!busy} onClick={save}>
                  Save changes
                </Button>
              </>
            )}
          </div>
          {busy === 'generate' && <Alert type="info">AI is writing questions from your material… this can take up to a minute.</Alert>}
          {questions.length === 0 && busy !== 'generate' ? (
            <div className="card mt">
              <Empty icon="✨" title="No questions yet">
                Click <b>Generate with AI</b>, or add questions manually below.
              </Empty>
            </div>
          ) : null}
          <QuestionEditor
            questions={questions}
            sections={sections}
            readOnly={locked}
            onChange={(qs) => {
              setQuestions(qs);
              setDirty(true);
            }}
          />
        </>
      )}

      {tab === 'assign' && <AssignTab test={test} onSaved={apply} run={run} busy={busy} />}
      {tab === 'settings' && <SettingsTab test={test} run={run} busy={busy} locked={locked} />}
      {tab === 'submissions' && <SubmissionsTab testId={id} onChange={load} />}
      {tab === 'analytics' && <AnalyticsTab testId={id} />}
    </>
  );
}

function AssignTab({ test, run, busy }) {
  const [teams, setTeams] = useState(null);
  const [students, setStudents] = useState([]);
  const [teamIds, setTeamIds] = useState(test.assignedTeams || []);
  const [studentIds, setStudentIds] = useState(test.assignedStudents || []);

  useEffect(() => {
    api.get('/teams').then(({ data }) => setTeams(data.teams));
    api.get('/students').then(({ data }) => setStudents(data.students));
  }, []);

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  if (!teams) return <LoadingPage />;
  return (
    <div className="stack">
      <Alert type={test.status === 'published' ? 'ok' : 'info'}>
        {test.status === 'published'
          ? `Published · ${test.assignedCount} student(s) can take this test.`
          : 'This test is a draft. Assign teams or students, then click Publish (top right). Students are emailed when it goes live.'}
      </Alert>
      <div className="grid grid-2">
        <div className="card">
          <h3>Teams</h3>
          {teams.length === 0 ? (
            <p className="muted small">
              No teams yet. <Link href="/admin/teams">Create a team</Link> and invite students.
            </p>
          ) : (
            <div className="stack mt">
              {teams.map((t) => (
                <label key={t.id} className="check section-box" style={{ margin: 0 }}>
                  <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggle(teamIds, setTeamIds, t.id)} />
                  <span className="spacer">{t.name}</span>
                  <span className="small muted">{t.studentCount} students</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Individual students</h3>
          {students.length === 0 ? (
            <p className="muted small">No students yet.</p>
          ) : (
            <div className="stack mt" style={{ maxHeight: 360, overflow: 'auto' }}>
              {students.map((s) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(studentIds, setStudentIds, s.id)} />
                  <span>
                    {s.name} <span className="small muted">{s.email}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="row">
        <span className="spacer" />
        <Button loading={busy === 'assign'} onClick={() => run('assign', () => api.post(`/tests/${test.id}/assign`, { teamIds, studentIds }), 'Assignment saved.')}>
          Save assignment
        </Button>
      </div>
    </div>
  );
}

function SettingsTab({ test, run, busy, locked }) {
  const [cfg, setCfg] = useState({
    title: test.title,
    description: test.description || '',
    uploadIds: test.uploadIds || [],
    topicHint: test.topicHint || '',
    duration: test.duration,
    totalMarks: test.totalMarks,
    difficulty: test.difficulty,
    allowOffline: test.allowOffline,
    dueDate: toLocalInput(test.dueDate),
    sections: test.sections.map((s) => ({ name: s.name, instructions: s.instructions || '', counts: s.counts })),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run('settings', () => api.put(`/tests/${test.id}`, configPayload(cfg)), 'Settings saved. Regenerate questions to apply new section counts.');
      }}
    >
      <TestConfigForm value={cfg} onChange={setCfg} lockedQuestions={locked} />
      <div className="row mt">
        <span className="small muted spacer">Renaming a section keeps its questions only if you also update them in the Questions tab.</span>
        <Button type="submit" loading={busy === 'settings'}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

function SubmissionsTab({ testId, onChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/submissions/test/${testId}`).then(({ data }) => setData(data)).catch((e) => setError(errorMessage(e))), [testId]);
  useEffect(() => {
    load();
  }, [load]);

  async function reset(s) {
    if (!confirm(`Delete ${s.studentName}'s submission so they can retake the test?`)) return;
    try {
      await api.delete(`/submissions/${s.id}`);
      load();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingPage />;
  if (!data.submissions.length)
    return (
      <div className="card">
        <Empty icon="📥" title="No submissions yet" />
      </div>
    );
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Score</th>
            <th>Submitted</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.submissions.map((s) => {
            const b = statusBadge(s.status, s.needsReview);
            return (
              <tr key={s.id}>
                <td>
                  <b>{s.studentName}</b>
                  <div className="small muted">{s.studentEmail}</div>
                </td>
                <td>
                  <Badge cls="badge-muted">{s.mode}</Badge>
                  {s.autoSubmitted && <div className="small muted">auto-submitted</div>}
                </td>
                <td>
                  <Badge cls={b.cls}>{b.label}</Badge>
                </td>
                <td className="nowrap">{s.status === 'in_progress' ? '—' : `${fmtMarks(s.totalScore)} / ${fmtMarks(s.maxScore)}`}</td>
                <td className="small muted nowrap">{fmtDate(s.submittedAt || s.startedAt)}</td>
                <td className="nowrap">
                  {s.status !== 'in_progress' && (
                    <Link className="btn btn-outline btn-sm" href={`/admin/submissions/${s.id}`}>
                      {s.needsReview ? 'Review & grade' : 'View'}
                    </Link>
                  )}{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => reset(s)} title="Allow retake">
                    ↺
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsTab({ testId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/analytics/test/${testId}`).then(({ data }) => setData(data));
  }, [testId]);
  if (!data) return <LoadingPage />;
  if (!data.kpis.attempts)
    return (
      <div className="card">
        <Empty icon="📊" title="No attempts yet">
          Analytics appear once students submit.
        </Empty>
      </div>
    );
  return (
    <>
      <div className="grid grid-4">
        <Stat label="Attempts" value={data.kpis.attempts} />
        <Stat label="Average" value={`${data.kpis.average}%`} />
        <Stat label="Highest" value={`${data.kpis.highest}%`} />
        <Stat label="Lowest" value={`${data.kpis.lowest}%`} />
      </div>
      <div className="grid grid-2 mt">
        <div className="card">
          <h3>Score distribution</h3>
          <DistributionChart data={data.distribution} />
        </div>
        <div className="card">
          <h3>Accuracy by concept</h3>
          <PercentBarChart data={data.concepts} labelKey="concept" horizontal height={Math.max(220, data.concepts.length * 36)} />
        </div>
      </div>
      <div className="card mt">
        <h3>Question-wise accuracy</h3>
        <PercentBarChart data={data.questions.map((q) => ({ ...q, label: `Q${q.number}` }))} labelKey="label" />
      </div>
      <div className="card mt table-wrap">
        <h3>Ranking</h3>
        <table className="table">
          <tbody>
            {data.students.map((s, i) => (
              <tr key={s.submissionId}>
                <td style={{ width: 40 }}>{i + 1}</td>
                <td>
                  <Link href={`/admin/submissions/${s.submissionId}`}>{s.name}</Link>
                </td>
                <td>
                  {fmtMarks(s.score)} / {fmtMarks(s.max)}
                </td>
                <td>
                  <b>{s.percent}%</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
