import { useEffect } from 'react';

export function Spinner({ small }) {
  return <span className={`spinner ${small ? 'spinner-sm' : ''}`} aria-label="Loading" />;
}

export function LoadingPage({ label = 'Loading…' }) {
  return (
    <div className="loading-page">
      <div className="center">
        <Spinner />
        <p className="muted small mt">{label}</p>
      </div>
    </div>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className="row">
        <div className="spacer">{children}</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function Button({ loading, children, className = '', ...props }) {
  return (
    <button className={`btn ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, icon }) {
  return (
    <div className="card stat">
      <div className="row">
        <span className="stat-label spacer">{label}</span>
        {icon && <span aria-hidden>{icon}</span>}
      </div>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Empty({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Badge({ cls = 'badge-muted', children }) {
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { maxWidth: 820 } : undefined} role="dialog" aria-modal="true">
        <div className="card-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ScoreRing({ percent, label }) {
  const p = Math.max(0, Math.min(100, percent || 0));
  const color = p >= 75 ? 'var(--ok)' : p >= 40 ? 'var(--primary)' : 'var(--danger)';
  return (
    <div className="score-ring" style={{ '--p': p, '--c': color }}>
      <div>
        <div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{Math.round(p)}%</div>
          {label && <div className="small muted">{label}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- CampusBite helpers
export const STATUS_FLOW = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const ALL_STATUSES = [...STATUS_FLOW, 'CANCELLED', 'REFUNDED'];
const STATUS_STYLE = {
  PLACED: 'badge-info', ACCEPTED: 'badge-primary', PREPARING: 'badge-warn', READY: 'badge-warn', ASSIGNED: 'badge-primary',
  OUT_FOR_DELIVERY: 'badge-primary', DELIVERED: 'badge-ok', CANCELLED: 'badge-danger', REFUNDED: 'badge-muted',
};
export const label = (s) => (s || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_STYLE[status] || 'badge-muted'}`}>{label(status)}</span>;
}

export function PaymentBadge({ status }) {
  const cls = { mock_paid: 'badge-ok', refunded: 'badge-muted', pending: 'badge-warn' }[status] || 'badge-muted';
  return <span className={`badge ${cls}`}>💳 {status === 'mock_paid' ? 'Paid (mock)' : label(status)}</span>;
}

export function ReturnBadge({ status }) {
  if (!status || status === 'none') return null;
  const cls = { requested: 'badge-warn', approved: 'badge-ok', rejected: 'badge-danger' }[status];
  return <span className={`badge ${cls}`}>↩ Return {status}</span>;
}

export function Timeline({ status }) {
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return <div className="alert alert-warn" style={{ margin: 0 }}>This order was {status.toLowerCase()}.</div>;
  }
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <div className="timeline" aria-label={`Order status: ${label(status)}`}>
      {STATUS_FLOW.map((s, i) => (
        <div key={s} className={`tl-step ${i < idx || status === 'DELIVERED' ? 'done' : ''} ${i === idx && status !== 'DELIVERED' ? 'current' : ''}`}>
          <div className="tl-dot">{i < idx || status === 'DELIVERED' ? '✓' : i + 1}</div>
          {label(s)}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }) {
  if (!pages || pages <= 1) return total ? <p className="center small muted mt">{total} record(s)</p> : null;
  return (
    <div className="pagination">
      <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="small muted">Page {page} of {pages} · {total} records</span>
      <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function Stars({ value }) {
  const v = Math.round(value || 0);
  return <span className="stars" aria-label={`${value} out of 5`}>{'★'.repeat(v)}{'☆'.repeat(5 - v)}</span>;
}

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const CUISINE_EMOJI = { 'north indian': '🍛', italian: '🍕', healthy: '🥗', chinese: '🥡', 'south indian': '🥞', cafe: '☕', desserts: '🍰' };
const CUISINE_BG = ['#fff1e6', '#fef3c7', '#ecfccb', '#e0f2fe', '#fce7f3', '#ede9fe'];
export const cuisineEmoji = (c) => CUISINE_EMOJI[(c || '').toLowerCase()] || '🍽️';
export const coverBg = (id) => CUISINE_BG[(id || 0) % CUISINE_BG.length];
const CAT_EMOJI = { curries: '🍛', rice: '🍚', breads: '🫓', desserts: '🍮', drinks: '🥤', pizza: '🍕', pasta: '🍝', sides: '🥖', bowls: '🥗', wraps: '🌯', smoothies: '🍓' };
export const dishEmoji = (cat) => CAT_EMOJI[(cat || '').toLowerCase()] || '🍽️';
