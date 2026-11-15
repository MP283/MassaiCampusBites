import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import { Alert, Button } from './ui';

const NEXT = {
  PLACED: [['ACCEPTED', '✓ Accept', 'btn-ok']],
  ACCEPTED: [['PREPARING', '🍳 Start preparing', '']],
  PREPARING: [['READY', '✅ Mark ready', 'btn-ok']],
};

/** Owner actions for one order: advance status, reject, assign delivery partner. */
export default function OwnerOrderActions({ order, partners, onUpdated }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [partner, setPartner] = useState('');

  async function run(key, fn) {
    setBusy(key);
    setError('');
    try {
      const { data } = await fn();
      onUpdated(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  const setStatus = (status) => run(status, () => api.patch(`/owner/orders/${order.id}/status`, { status }));

  return (
    <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
      {error && <Alert onClose={() => setError('')}>{error}</Alert>}
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        {(NEXT[order.status] || []).map(([s, text, cls]) => (
          <Button key={s} className={`btn-sm ${cls}`} loading={busy === s} disabled={!!busy} onClick={() => setStatus(s)}>{text}</Button>
        ))}
        {order.status === 'PLACED' && (
          <Button className="btn-sm btn-outline" loading={busy === 'CANCELLED'} disabled={!!busy}
            onClick={() => window.confirm(`Reject order #${order.id}? The customer is refunded automatically.`) && setStatus('CANCELLED')}>
            Reject
          </Button>
        )}
        {order.status === 'READY' && (
          <>
            <select value={partner} onChange={(e) => setPartner(e.target.value)} style={{ width: 'auto', padding: '5px 8px' }} aria-label="Delivery partner">
              <option value="">Choose delivery partner…</option>
              {(partners || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button className="btn-sm" loading={busy === 'assign'} disabled={!partner || !!busy}
              onClick={() => run('assign', () => api.post(`/owner/orders/${order.id}/assign`, { delivery_partner_id: Number(partner) }))}>
              🛵 Assign
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
