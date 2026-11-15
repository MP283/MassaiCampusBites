'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { TYPE_LABELS, TYPES } from '@/lib/format';

export const emptyCounts = () => ({ mcq: 0, fill_blank: 0, match: 0, short: 0, long: 0 });

export const defaultConfig = () => ({
  title: '',
  description: '',
  uploadIds: [],
  topicHint: '',
  duration: 30,
  totalMarks: 25,
  difficulty: 'medium',
  allowOffline: true,
  dueDate: '',
  sections: [
    { name: 'Section A - Objective', instructions: 'Choose or write the correct answer.', counts: { ...emptyCounts(), mcq: 5, fill_blank: 3, match: 1 } },
    { name: 'Section B - Written', instructions: 'Answer in your own words.', counts: { ...emptyCounts(), short: 2, long: 1 } },
  ],
});

export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function configPayload(cfg) {
  return {
    ...cfg,
    duration: Number(cfg.duration),
    totalMarks: Number(cfg.totalMarks),
    dueDate: cfg.dueDate ? new Date(cfg.dueDate).toISOString() : null,
    sections: cfg.sections.map((s) => ({ ...s, counts: Object.fromEntries(TYPES.map((t) => [t, Number(s.counts[t] || 0)])) })),
  };
}

export default function TestConfigForm({ value, onChange, lockedQuestions }) {
  const [uploads, setUploads] = useState(null);
  useEffect(() => {
    api.get('/uploads').then(({ data }) => setUploads(data.uploads)).catch(() => setUploads([]));
  }, []);

  const set = (k, v) => onChange({ ...value, [k]: v });
  const setSection = (i, patch) => set('sections', value.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const total = value.sections.reduce((n, s) => n + TYPES.reduce((m, t) => m + Number(s.counts[t] || 0), 0), 0);

  return (
    <div className="stack">
      <div className="card">
        <h3>1 · Basics</h3>
        <div className="grid grid-2 mt">
          <label className="field">
            Test title
            <input type="text" required value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Unit 3 - Photosynthesis" />
          </label>
          <label className="field">
            Difficulty
            <select value={value.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="field">
            Duration (minutes)
            <input type="number" min={1} max={600} required value={value.duration} onChange={(e) => set('duration', e.target.value)} />
          </label>
          <label className="field">
            Total marks <span className="field-hint">Marks are distributed across questions automatically</span>
            <input type="number" min={1} max={1000} step="0.5" required value={value.totalMarks} onChange={(e) => set('totalMarks', e.target.value)} />
          </label>
          <label className="field">
            Due date <span className="field-hint">Optional; students can&apos;t start after this</span>
            <input type="datetime-local" value={value.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
          </label>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" checked={value.allowOffline} onChange={(e) => set('allowOffline', e.target.checked)} />
            Allow offline mode (download PDF &amp; upload answer sheet)
          </label>
        </div>
        <label className="field mt">
          Instructions for students
          <textarea rows={2} value={value.description} onChange={(e) => set('description', e.target.value)} placeholder="Answer all questions…" />
        </label>
      </div>

      <div className="card">
        <h3>2 · Source material</h3>
        <p className="muted small">The AI writes questions only from the content you select. You can also add a focus topic.</p>
        {!uploads ? (
          <span className="spinner" />
        ) : uploads.length === 0 ? (
          <p className="small">
            No uploads yet. <Link href="/admin/uploads">Upload content</Link>, or just enter a topic below.
          </p>
        ) : (
          <div className="grid grid-2">
            {uploads.map((u) => (
              <label key={u.id} className="check section-box" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={value.uploadIds.includes(u.id)}
                  onChange={(e) => set('uploadIds', e.target.checked ? [...value.uploadIds, u.id] : value.uploadIds.filter((x) => x !== u.id))}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.originalName}</span>
                  <span className="small muted">{u.textLength.toLocaleString()} chars</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <label className="field mt">
          Focus topic / extra instructions for the AI <span className="field-hint">Optional</span>
          <input type="text" value={value.topicHint} onChange={(e) => set('topicHint', e.target.value)} placeholder="e.g. Focus on the light-dependent reactions" />
        </label>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>3 · Sections &amp; question types</h3>
          <span className="badge badge-primary">{total} questions</span>
        </div>
        {lockedQuestions && <p className="small" style={{ color: 'var(--warn)' }}>Students have attempted this test, so question counts no longer change the paper.</p>}
        {value.sections.map((s, i) => (
          <div className="section-box" key={i}>
            <div className="row mb">
              <input type="text" value={s.name} onChange={(e) => setSection(i, { name: e.target.value })} style={{ flex: 1, minWidth: 180, fontWeight: 600 }} aria-label="Section name" />
              {value.sections.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('sections', value.sections.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            <input type="text" className="mb" value={s.instructions} onChange={(e) => setSection(i, { instructions: e.target.value })} placeholder="Section instructions (optional)" aria-label="Section instructions" />
            <div className="count-grid mt">
              {TYPES.map((t) => (
                <label className="field" key={t}>
                  <span className="small">{TYPE_LABELS[t]}</span>
                  <input type="number" min={0} max={50} value={s.counts[t]} onChange={(e) => setSection(i, { counts: { ...s.counts, [t]: e.target.value } })} />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-outline mt"
          onClick={() => set('sections', [...value.sections, { name: `Section ${String.fromCharCode(65 + value.sections.length)}`, instructions: '', counts: { ...emptyCounts(), mcq: 5 } }])}
        >
          + Add section
        </button>
      </div>
    </div>
  );
}
