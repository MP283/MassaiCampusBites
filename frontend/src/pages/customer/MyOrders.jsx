import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks';
import OrderFilters, { toParams } from '../../components/OrderFilters';
import OrderItems from '../../components/OrderItems';
import CustomerActions from '../../components/CustomerActions';
import { Alert, Empty, LoadingPage, Pagination, PaymentBadge, ReturnBadge, Stars, StatusBadge, fmtDate, money } from '../../components/ui';

const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'];

export default function MyOrders() {
  const [filters, setFilters] = useState({ page: 1 });
  const { data, loading, error, reload, setData } = useFetch('/orders', toParams(filters));

  const replace = (o) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === o.id ? o : x)) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My orders</h1>
          <p>Track current orders and review past ones.</p>
        </div>
        <div className="row">
          <button className="btn btn-outline" onClick={reload}>↻ Refresh</button>
          <Link to="/insights" className="btn">✨ AI insights</Link>
        </div>
      </div>
      <OrderFilters value={filters} onChange={setFilters} />
      <Alert>{error}</Alert>
      {loading && !data ? <LoadingPage /> : !data?.items.length ? (
        <Empty icon="🧾" title="No orders found">{filters.status || filters.date_from ? 'Try clearing the filters.' : <Link to="/restaurants">Place your first order</Link>}</Empty>
      ) : (
        <>
          <div className="stack">
            {data.items.map((o) => (
              <div key={o.id} className={`card order-card ${ACTIVE.includes(o.status) ? '' : ''}`}>
                <div className="order-head">
                  <Link to={`/orders/${o.id}`}><b>Order #{o.id}</b></Link>
                  <span className="muted small">· {o.restaurant_name} · {fmtDate(o.created_at)}</span>
                  <span className="spacer" />
                  <StatusBadge status={o.status} />
                  <PaymentBadge status={o.payment_status} />
                  <ReturnBadge status={o.return_status} />
                </div>
                <div className="row mt" style={{ alignItems: 'flex-start' }}>
                  <div className="spacer">
                    <OrderItems order={o} compact />
                    <div className="mt"><b>{money(o.total_amount)}</b></div>
                    {o.review && <div className="small mt"><Stars value={o.review.rating} /> {o.review.comment && <span className="muted">"{o.review.comment}"</span>}</div>}
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <CustomerActions order={o} onUpdated={replace} />
                    <Link to={`/orders/${o.id}`} className="btn btn-ghost btn-sm">{ACTIVE.includes(o.status) ? 'Track order →' : 'Details →'}</Link>
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
