'use client';

import { TYPE_LABELS, fmtMarks } from '@/lib/format';
import { fileUrl } from '@/lib/api';
import { Badge } from './ui';

function letter(i) {
  return String.fromCharCode(65 + Number(i));
}

function blank(v) {
  return v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.every((x) => x == null || x === ''));
}

function ResponseBlock({ q }) {
  const r = q.response;
  const ok = q.isCorrect;
  const cls = q.gradedBy === 'pending' ? '' : ok ? 'correct' : blank(r) ? '' : 'wrong';

  if (q.type === 'mcq') {
    return (
      <div className="stack" style={{ gap: 6 }}>
        {q.options.map((o, i) => {
          const chosen = r !== null && r !== undefined && Number(r) === i;
          const correct = Number(q.correctAnswer) === i;
          return (
            <div key={i} className={`answer-box ${correct ? 'correct' : chosen ? 'wrong' : ''}`}>
              <b>{letter(i)}.</b> {o} {correct && ' ✓'} {chosen && !correct && ' ✗ (your answer)'} {chosen && correct && ' (your answer)'}
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'match') {
    const resp = Array.isArray(r) ? r : [];
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Your match</th>
              <th>Correct match</th>
            </tr>
          </thead>
          <tbody>
            {q.pairs.map((p, i) => {
              const good = resp[i] && resp[i] === p.right;
              return (
                <tr key={i}>
                  <td>{p.left}</td>
                  <td style={{ color: good ? 'var(--ok)' : 'var(--danger)' }}>{resp[i] || '—'}</td>
                  <td>{p.right}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div>
        <div className="small muted">Your answer</div>
        <div className={`answer-box ${cls}`}>{blank(r) ? <span className="muted">Not answered</span> : String(r)}</div>
      </div>
      <div>
        <div className="small muted">{q.type === 'fill_blank' ? 'Accepted answer(s)' : 'Model answer'}</div>
        <div className="answer-box">{Array.isArray(q.correctAnswer) ? q.correctAnswer.join(' / ') : q.correctAnswer}</div>
      </div>
    </div>
  );
}

export default function ResultView({ submission, grading, onGradeChange }) {
  const sections = [];
  submission.questions.forEach((q) => {
    if (!sections.includes(q.section)) sections.push(q.section);
  });
  let n = 0;
  return (
    <div>
      {submission.files?.length > 0 && (
        <div className="card mb">
          <h3>Uploaded answer sheet</h3>
          <div className="row mt">
            {submission.files.map((f) => (
              <a key={f.filePath} className="btn btn-outline btn-sm" href={fileUrl(f.url)} target="_blank" rel="noreferrer">
                📎 {f.originalName}
              </a>
            ))}
          </div>
          {submission.extractedText && (
            <details className="mt">
              <summary className="small">OCR text</summary>
              <div className="text-preview mt">{submission.extractedText}</div>
            </details>
          )}
        </div>
      )}
      {sections.map((sec) => (
        <div key={sec}>
          <div className="section-title">
            <h3>{sec}</h3>
          </div>
          {submission.questions
            .filter((q) => q.section === sec)
            .map((q) => {
              n += 1;
              const g = grading?.[q.id];
              const scoreColor = q.gradedBy === 'pending' ? 'badge-warn' : q.score >= q.maxScore ? 'badge-ok' : q.score > 0 ? 'badge-info' : 'badge-danger';
              return (
                <div className="q-card" key={q.id}>
                  <div className="q-head">
                    <span className="q-num">Q{n}</span>
                    <Badge>{TYPE_LABELS[q.type]}</Badge>
                    {q.concept && <Badge cls="badge-primary">{q.concept}</Badge>}
                    <span className="spacer" />
                    {grading ? (
                      <label className="row small" style={{ gap: 6 }}>
                        Score
                        <input
                          type="number"
                          min={0}
                          max={q.maxScore}
                          step={0.25}
                          value={g?.score ?? q.score}
                          onChange={(e) => onGradeChange(q.id, { score: e.target.value })}
                          style={{ width: 80 }}
                        />
                        / {fmtMarks(q.maxScore)}
                      </label>
                    ) : (
                      <Badge cls={scoreColor}>
                        {fmtMarks(q.score)} / {fmtMarks(q.maxScore)}
                        {q.gradedBy === 'pending' ? ' (provisional)' : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="question-text" style={{ fontSize: '1rem' }}>
                    {q.text}
                  </p>
                  <ResponseBlock q={q} />
                  {grading ? (
                    <label className="field mt">
                      <span className="small">Feedback to student</span>
                      <input type="text" value={g?.feedback ?? q.feedback ?? ''} onChange={(e) => onGradeChange(q.id, { feedback: e.target.value })} />
                    </label>
                  ) : (
                    q.feedback && (
                      <p className="small mt" style={{ margin: '10px 0 0' }}>
                        <b>Feedback{q.gradedBy === 'ai' ? ' (AI)' : q.gradedBy === 'admin' ? ' (teacher)' : ''}:</b> {q.feedback}
                      </p>
                    )
                  )}
                  {q.explanation && (
                    <p className="small muted" style={{ margin: '6px 0 0' }}>
                      💡 {q.explanation}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
