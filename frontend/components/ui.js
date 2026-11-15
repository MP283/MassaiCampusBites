'use client';

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
