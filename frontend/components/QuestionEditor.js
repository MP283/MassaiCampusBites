'use client';

import { TYPE_LABELS, TYPES, fmtMarks } from '@/lib/format';

export function blankQuestion(type, section) {
  const base = { type, section, text: '', marks: type === 'long' ? 5 : type === 'short' ? 3 : type === 'match' ? 2 : 1, concept: '', explanation: '', options: [], pairs: [], correctAnswer: null };
  if (type === 'mcq') return { ...base, options: ['', '', '', ''], correctAnswer: 0 };
  if (type === 'fill_blank') return { ...base, text: '_____', correctAnswer: [''] };
  if (type === 'match') return { ...base, text: 'Match the following.', pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] };
  return { ...base, correctAnswer: '' };
}

function QuestionCard({ q, index, onChange, onRemove, onMove, sections, readOnly }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const changeType = (type) => {
    const fresh = blankQuestion(type, q.section);
    onChange({ ...fresh, text: q.text || fresh.text, marks: q.marks, concept: q.concept, explanation: q.explanation, id: q.id });
  };

  return (
    <div className="q-card">
      <div className="q-head">
        <span className="q-num">Q{index + 1}</span>
        <select value={q.type} onChange={(e) => changeType(e.target.value)} disabled={readOnly} style={{ width: 'auto' }} aria-label="Question type">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={q.section} onChange={(e) => set({ section: e.target.value })} disabled={readOnly} style={{ width: 'auto' }} aria-label="Section">
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="row small" style={{ gap: 6 }}>
          Marks
          <input type="number" min={0.25} step={0.25} value={q.marks} disabled={readOnly} onChange={(e) => set({ marks: e.target.value })} style={{ width: 80 }} />
        </label>
        <span className="spacer" />
        {!readOnly && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(-1)} aria-label="Move up">
              ↑
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(1)} aria-label="Move down">
              ↓
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} aria-label="Delete question">
              🗑
            </button>
          </>
        )}
      </div>

      <textarea rows={2} value={q.text} disabled={readOnly} onChange={(e) => set({ text: e.target.value })} placeholder="Question text" aria-label="Question text" />
      {q.type === 'fill_blank' && <p className="small muted" style={{ margin: '4px 0 0' }}>Write the blank as _____ (five underscores).</p>}

      <div className="mt">
        {q.type === 'mcq' && (
          <div>
            <div className="small muted mb">Options (select the correct one)</div>
            {q.options.map((o, i) => (
              <div className="opt-row" key={i}>
                <input type="radio" name={`correct-${index}`} checked={Number(q.correctAnswer) === i} disabled={readOnly} onChange={() => set({ correctAnswer: i })} aria-label={`Mark option ${i + 1} correct`} />
                <b style={{ width: 18 }}>{String.fromCharCode(65 + i)}</b>
                <input type="text" value={o} disabled={readOnly} onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                {!readOnly && q.options.length > 2 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const options = q.options.filter((_, j) => j !== i);
                      let ca = Number(q.correctAnswer);
                      if (ca === i) ca = 0;
                      else if (ca > i) ca -= 1;
                      set({ options, correctAnswer: ca });
                    }}
                    aria-label="Remove option"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!readOnly && q.options.length < 6 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ options: [...q.options, ''] })}>
                + Option
              </button>
            )}
          </div>
        )}

        {q.type === 'fill_blank' && (
          <label className="field">
            <span className="small">Accepted answers (comma-separated)</span>
            <input
              type="text"
              value={(q.correctAnswer || []).join(', ')}
              disabled={readOnly}
              onChange={(e) => set({ correctAnswer: e.target.value.split(',').map((s) => s.trimStart()) })}
            />
          </label>
        )}

        {q.type === 'match' && (
          <div>
            <div className="pair-row small muted">
              <span>Left (term)</span>
              <span>Right (correct match)</span>
              <span />
            </div>
            {q.pairs.map((p, i) => (
              <div className="pair-row" key={i}>
                <input type="text" value={p.left} disabled={readOnly} onChange={(e) => set({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} />
                <input type="text" value={p.right} disabled={readOnly} onChange={(e) => set({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} />
                {!readOnly && q.pairs.length > 2 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ pairs: q.pairs.filter((_, j) => j !== i) })} aria-label="Remove pair">
                    ✕
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {!readOnly && q.pairs.length < 8 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ pairs: [...q.pairs, { left: '', right: '' }] })}>
                + Pair
              </button>
            )}
            <p className="small muted" style={{ margin: '4px 0 0' }}>Students see the right column shuffled.</p>
          </div>
        )}

        {(q.type === 'short' || q.type === 'long') && (
          <label className="field">
            <span className="small">Model answer / key points (used for AI grading)</span>
            <textarea rows={q.type === 'long' ? 4 : 2} value={q.correctAnswer || ''} disabled={readOnly} onChange={(e) => set({ correctAnswer: e.target.value })} />
          </label>
        )}
      </div>

      <div className="grid grid-2 mt">
        <label className="field">
          <span className="small">Concept / topic</span>
          <input type="text" value={q.concept || ''} disabled={readOnly} onChange={(e) => set({ concept: e.target.value })} />
        </label>
        <label className="field">
          <span className="small">Explanation (shown to students after grading)</span>
          <input type="text" value={q.explanation || ''} disabled={readOnly} onChange={(e) => set({ explanation: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

export default function QuestionEditor({ questions, onChange, sections, readOnly }) {
  const update = (i, q) => onChange(questions.map((x, j) => (j === i ? q : x)));
  const remove = (i) => onChange(questions.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (section, type) => onChange([...questions, blankQuestion(type, section)]);

  return (
    <div>
      {sections.map((sec) => {
        const items = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.section === sec);
        const marks = items.reduce((n, { q }) => n + Number(q.marks || 0), 0);
        return (
          <div key={sec}>
            <div className="section-title">
              <h3>{sec}</h3>
              <span className="badge badge-muted">
                {items.length} questions · {fmtMarks(marks)} marks
              </span>
            </div>
            {items.map(({ q, i }) => (
              <QuestionCard
                key={q.id || `new-${i}`}
                q={q}
                index={i}
                sections={sections}
                readOnly={readOnly}
                onChange={(nq) => update(i, nq)}
                onRemove={() => remove(i)}
                onMove={(d) => move(i, d)}
              />
            ))}
            {!readOnly && (
              <div className="row mt">
                <span className="small muted">Add:</span>
                {TYPES.map((t) => (
                  <button type="button" key={t} className="btn btn-outline btn-sm" onClick={() => add(sec, t)}>
                    + {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
