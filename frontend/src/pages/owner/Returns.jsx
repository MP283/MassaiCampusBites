import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useFetch } from '../../hooks';
import OrderItems from '../../components/OrderItems';
import { Alert, Button, Empty, LoadingPage, Pagination, PaymentBadge, ReturnBadge, StatusBadge, fmtDate, money } from '../../components/ui';

const TABS = [['requested', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];

export default function Returns() {
  const [tab, setTab] = useState('requested');
  const [page, setPage] = useState(1);
  const { data, loading, error, setData } = useFetch('/owner/returns', { return_status: tab, page, size: 10 });
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  async function decide(order, approve) {
    if (!window.confirm(approve ? `Approve refund of ${money(order.total_amount)} for order #${order.id}?` : `Reject the return request for order #${order.id}?`)) return;
    setBusy(`${order.id}-${approve}`);
    setActionError('');
    try {
      await api.post(`/owner/orders/${order.id}/return-decision`, { approve });
      setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== order.id), total: d.total - 1 }));
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Returns & refunds</h1>
          <p>Approve or reject customer return requests. Approved requests are refunded to the customer's mock payment.</p>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(([k, text]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setPage(1); }}>{text}</button>)}
      </div>
      <Alert>{error}</Alert>
      <Alert onClose={() => setActionError('')}>{actionError}</Alert>
      {loading && !data ? <LoadingPage /> : !data?.items.length ? <Empty icon="↩️" title={`No ${TABS.find((t) => t[0] === tab)[1].toLowerCase()} return requests`} /> : (
        <>
          <div className="stack">
            {data.items.map((o) => (
              <div key={o.id} className="card">
                <div className="order-head row">
                  <Link to={`/orders/${o.id}`}><b>Order #{o.id}</b></Link>
                  <span className="small muted">{o.customer?.name} · ordered {fmtDate(o.created_at)}</span>
                  <span className="spacer" />
                  <StatusBadge status={o.status} /> <PaymentBadge status={o.payment_status} /> <ReturnBadge status={o.return_status} />
                </div>
                <div className="alert alert-warn mt" style={{ marginBottom: 8 }}><b>Reason:</b> {o.return_reason}</div>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="spacer"><OrderItems order={o} compact /><div className="mt"><b>{money(o.total_amount)}</b></div></div>
                  {tab === 'requested' && (
                    <div className="row">
                      <Button className="btn-ok btn-sm" loading={busy === `${o.id}-true`} disabled={!!busy} onClick={() => decide(o, true)}>Approve refund</Button>
                      <Button className="btn-outline btn-sm" loading={busy === `${o.id}-false`} disabled={!!busy} onClick={() => decide(o, false)}>Reject</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
