export const TYPE_LABELS = {
  mcq: 'Multiple choice',
  fill_blank: 'Fill in the blank',
  match: 'Match the following',
  short: 'Short answer',
  long: 'Long answer',
};
export const TYPES = Object.keys(TYPE_LABELS);

export function fmtDate(iso, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function pct(score, max) {
  if (!max) return 0;
  return Math.round((1000 * score) / max) / 10;
}

export function fmtMarks(m) {
  const n = Number(m || 0);
  return String(Math.round(n * 100) / 100);
}

export function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function statusBadge(status, needsReview) {
  if (status === 'in_progress') return { cls: 'badge-warn', label: 'In progress' };
  if (needsReview) return { cls: 'badge-warn', label: 'Awaiting review' };
  if (status === 'graded') return { cls: 'badge-ok', label: 'Graded' };
  if (status === 'submitted') return { cls: 'badge-info', label: 'Submitted' };
  if (status === 'published') return { cls: 'badge-ok', label: 'Published' };
  if (status === 'draft') return { cls: 'badge-muted', label: 'Draft' };
  return { cls: 'badge-muted', label: status || '—' };
}
