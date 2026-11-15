'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { authedUrl, errorMessage } from '@/lib/api';
import { TYPE_LABELS, fmtMarks } from '@/lib/format';
import { Alert, Button, LoadingPage } from '@/components/ui';

export default function TestIntroPage() {
  const { id } = useParams();
  const router = useRouter();
  const [paper, setPaper] = useState(null);
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/tests/${id}/paper`).then(({ data }) => setPaper(data.test)).catch((e) => setError(errorMessage(e)));
  }, [id]);

  async function submitOffline() {
    if (!files.length) return setError('Choose at least one photo or PDF of your answer sheet.');
    if (!confirm('Submit your answer sheet? You cannot change it afterwards.')) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      const { data } = await api.post(`/submissions/offline/${id}`, fd);
      router.replace(`/student/results/${data.submissionId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (error && !paper) return <Alert>{error}</Alert>;
  if (!paper) return <LoadingPage />;

  const counts = paper.questions.reduce((m, q) => ({ ...m, [q.type]: (m[q.type] || 0) + 1 }), {});

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small mb">
            <Link href="/student">← My tests</Link>
          </div>
          <h1>{paper.title}</h1>
          <p>
            {paper.institution?.name && `${paper.institution.name} · `}
            {paper.questions.length} questions · {fmtMarks(paper.totalMarks)} marks · {paper.duration} minutes
          </p>
        </div>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="grid grid-2">
        <div className="card stack">
          <h2>🖥 Take it online</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              The timer starts when you click <b>Start test</b> and keeps running if you close the page.
            </li>
            <li>Your answers are saved automatically every few seconds.</li>
            <li>Use the question palette to jump between questions and mark them for review.</li>
            <li>The test is submitted automatically when time runs out.</li>
            {paper.description && <li>{paper.description}</li>}
          </ul>
          <div className="section-box small">
            <b>Paper pattern</b>
            <div className="row mt" style={{ gap: 6 }}>
              {Object.entries(counts).map(([t, c]) => (
                <span key={t} className="badge badge-primary">
                  {c} × {TYPE_LABELS[t]}
                </span>
              ))}
            </div>
            <div className="mt">
              {paper.sections.map((s) => (
                <div key={s.name}>
                  <b>{s.name}</b>
                  {s.instructions && <span className="muted"> · {s.instructions}</span>}
                </div>
              ))}
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I have read the instructions and am ready to begin
          </label>
          <button className="btn btn-lg" disabled={!agree} onClick={() => router.push(`/exam/${id}`)}>
            Start test →
          </button>
        </div>

        {paper.allowOffline && (
          <div className="card stack">
            <h2>📝 Or do it on paper</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Download the question paper, write your answers on paper, then upload clear photos or a PDF of your answer sheet.
              Number your answers to match the questions.
            </p>
            <a className="btn btn-outline" href={authedUrl(`/tests/${id}/pdf`)} target="_blank" rel="noreferrer">
              ⬇ Download question paper (PDF)
            </a>
            <div className="section-box stack">
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
                📎 Choose answer sheet files
              </button>
              {files.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
              <Button loading={busy} disabled={!files.length} onClick={submitOffline}>
                {busy ? 'Uploading & grading…' : 'Submit answer sheet'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
