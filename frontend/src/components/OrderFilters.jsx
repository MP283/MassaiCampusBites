import { ALL_STATUSES, label } from './ui';

/** Status + date range filters shared by the dashboards. */
export default function OrderFilters({ value, onChange, statuses = ALL_STATUSES, showDates = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value, page: 1 });
  const active = value.status || value.date_from || value.date_to;
  return (
    <div className="filters mb">
      <label className="field">
        <span className="small">Status</span>
        <select value={value.status || ''} onChange={set('status')}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
      </label>
      {showDates && (
        <>
          <label className="field">
            <span className="small">From</span>
            <input type="date" value={value.date_from || ''} onChange={set('date_from')} />
          </label>
          <label className="field">
            <span className="small">To</span>
            <input type="date" value={value.date_to || ''} onChange={set('date_to')} />
          </label>
        </>
      )}
      {active && (
        <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => onChange({ page: 1 })}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Build query params, dropping empty values. */
export function toParams(f, size = 10) {
  const p = { page: f.page || 1, size };
  ['status', 'date_from', 'date_to'].forEach((k) => {
    if (f[k]) p[k] = f[k];
  });
  return p;
}
