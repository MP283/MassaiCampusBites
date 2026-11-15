import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import { Alert, Button, Modal } from './ui';

/** Cancel / Review / Return buttons + modals for a customer's order. Calls onUpdated(order) on success. */
export default function CustomerActions({ order, onUpdated, size = 'btn-sm' }) {
  const [modal, setModal] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const { data } = await fn();
      onUpdated(data);
      setModal(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const cancel = () => {
    if (window.confirm(`Cancel order #${order.id}? Your mock payment will be refunded.`)) run(() => api.post(`/orders/${order.id}/cancel`));
  };

  return (
    <>
      {error && !modal && <Alert onClose={() => setError('')}>{error}</Alert>}
      <div className="row" style={{ gap: 6 }}>
        {order.can_cancel && <Button className={`btn-outline ${size}`} loading={busy && !modal} onClick={cancel}>Cancel order</Button>}
        {order.can_review && <button className={`btn ${size}`} onClick={() => setModal('review')}>★ Rate & review</button>}
        {order.can_request_return && <button className={`btn btn-outline ${size}`} onClick={() => setModal('return')}>↩ Request return</button>}
      </div>

      <Modal open={modal === 'review'} onClose={() => setModal(null)} title={`Review order #${order.id}`}>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <div className="stack">
          <div className="star-input center" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>
            ))}
          </div>
          <label className="field">Comment (optional)<textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the food?" /></label>
          <Button loading={busy} onClick={() => run(() => api.post(`/orders/${order.id}/review`, { rating, comment }))}>Submit review</Button>
        </div>
      </Modal>

      <Modal open={modal === 'return'} onClose={() => setModal(null)} title={`Return / refund for order #${order.id}`}>
        <Alert onClose={() => setError('')}>{error}</Alert>
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>The restaurant will review your request. You can submit only one request per order.</p>
          <label className="field">Reason<textarea rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong item delivered" /></label>
          <Button loading={busy} disabled={reason.trim().length < 5} onClick={() => run(() => api.post(`/orders/${order.id}/return`, { reason }))}>Submit request</Button>
        </div>
      </Modal>
    </>
  );
}
