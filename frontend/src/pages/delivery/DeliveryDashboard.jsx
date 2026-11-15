import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import OrderFilters from '../../components/OrderFilters';
import OrderItems from '../../components/OrderItems';
import { Alert, Button, Empty, LoadingPage, Pagination, Stat, StatusBadge, fmtDate, money } from '../../components/ui';

const TABS = [['active', '🛵 Active deliveries', ['ASSIGNED', 'OUT_FOR_DELIVERY']], ['history', '📜 Delivery history', ['DELIVERED', 'REFUNDED']]];

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const [scope, setScope] = useState('active');
  const [filters, setFilters] = useState({ page: 1 });
  const params = { scope, page: filters.page || 1, size: 10, ...(filters.status && { status: filters.status }) };
  const { data, loading, error, reload, setData } = useFetch('/delivery/orders', params);
  const { data: activeCount, reload: reloadCount } = useFetch('/delivery/orders', { scope: 'active', size: 1 });
  const { data: historyCount, reload: reloadHistory } = useFetch('/delivery/orders', { scope: 'history', size: 1 });
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  async function update(order, status) {
    setBusy(`${order.id}`);
    setActionError('');
    try {
      const { data: updated } = await api.patch(`/delivery/orders/${order.id}/status`, { status });
      setData((d) => ({
        ...d,
        items: status === 'DELIVERED' ? d.items.filter((x) => x.id !== order.id) : d.items.map((x) => (x.id === updated.id ? updated : x)),
      }));
      reloadCount();
      reloadHistory();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  const tab = TABS.find((t) => t[0] === scope);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi {user.name.split(' ')[0]} 🛵</h1>
          <p>Your assigned deliveries.</p>
        </div>
        <button className="btn btn-outline" onClick={() => { reload(); reloadCount(); reloadHistory(); }}>↻ Refresh</button>
      </div>
      <div className="grid grid-3 mb">
        <Stat label="Active deliveries" value={activeCount?.total ?? '—'} icon="📦" />
        <Stat label="Completed deliveries" value={historyCount?.total ?? '—'} icon="✅" />
        <Stat label="Next step" value={activeCount?.total ? 'Deliver!' : 'Relax'} sub={activeCount?.total ? 'You have orders to deliver' : 'No active orders'} icon="🧭" />
      </div>
      <div className="tabs">
        {TABS.map(([k, text]) => <button key={k} className={`tab ${scope === k ? 'active' : ''}`} onClick={() => { setScope(k); setFilters({ page: 1 }); }}>{text}</button>)}
      </div>
      <OrderFilters value={filters} onChange={setFilters} statuses={tab[2]} showDates={false} />
      <Alert>{error}</Alert>
      <Alert onClose={() => setActionError('')}>{actionError}</Alert>
      {loading && !data ? <LoadingPage /> : !data?.items.length ? (
        <Empty icon={scope === 'active' ? '🛵' : '📜'} title={scope === 'active' ? 'No active deliveries' : 'No deliveries yet'}>
          {scope === 'active' && 'Orders assigned to you by restaurants will appear here.'}
        </Empty>
      ) : (
        <>
          <div className="stack">
            {data.items.map((o) => (
              <div key={o.id} className="card order-card">
                <div className="order-head">
                  <Link to={`/orders/${o.id}`}><b>Order #{o.id}</b></Link>
                  <span className="small muted">from <b>{o.restaurant_name}</b> · {fmtDate(o.created_at)}</span>
                  <span className="spacer" />
                  <StatusBadge status={o.status} />
                </div>
                <div className="grid grid-2 mt">
                  <div className="section-box">
                    <div className="small muted">Deliver to</div>
                    <b>{o.customer?.name}</b>
                    <div>📍 {o.delivery_address}</div>
                    {(o.contact_phone || o.customer?.phone) && <div>📞 <a href={`tel:${o.contact_phone || o.customer.phone}`}>{o.contact_phone || o.customer.phone}</a></div>}
                    {o.notes && <div className="small muted">📝 {o.notes}</div>}
                  </div>
                  <div>
                    <OrderItems order={o} compact />
                    <div className="mt">Order value: <b>{money(o.total_amount)}</b> <span className="small muted">(prepaid - mock)</span></div>
                    <div className="row mt">
                      {o.status === 'ASSIGNED' && <Button loading={busy === `${o.id}`} onClick={() => update(o, 'OUT_FOR_DELIVERY')}>📦 Picked up - out for delivery</Button>}
                      {o.status === 'OUT_FOR_DELIVERY' && <Button className="btn-ok" loading={busy === `${o.id}`} onClick={() => update(o, 'DELIVERED')}>✅ Mark delivered</Button>}
                      {scope === 'history' && <span className="small muted">Last updated {fmtDate(o.updated_at)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setFilters({ ...filters, page: p })} />
        </>
      )}
    </>
  );
}
