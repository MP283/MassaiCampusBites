import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useFetch } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import OrderItems from '../../components/OrderItems';
import CustomerActions from '../../components/CustomerActions';
import { Alert, LoadingPage, PaymentBadge, ReturnBadge, Stars, StatusBadge, Timeline, fmtDate, label, money } from '../../components/ui';

const LIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'];

/** Order tracking page (customer) - also viewable by the restaurant owner and assigned delivery partner. */
export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const { data: o, error, loading, reload, setData } = useFetch(`/orders/${id}`);
  const placed = location.search.includes('placed=1');

  // poll every 15 s while the order is in progress (no websockets needed)
  useEffect(() => {
    if (!o || !LIVE.includes(o.status)) return undefined;
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [o, reload]);

  if (error) return <Alert>{error}</Alert>;
  if (loading && !o) return <LoadingPage />;
  const back = { customer: ['/orders', 'My orders'], owner: ['/owner/orders', 'Orders'], delivery: ['/delivery', 'Deliveries'] }[user.role];

  return (
    <>
      <div className="small mb"><Link to={back[0]}>← {back[1]}</Link></div>
      {placed && <Alert type="ok">🎉 Order placed! Your dummy payment was successful. You can track it here.</Alert>}
      <div className="page-head">
        <div>
          <h1>Order #{o.id}</h1>
          <p>{o.restaurant_name} · placed {fmtDate(o.created_at)} · last update {fmtDate(o.updated_at)}</p>
        </div>
        <div className="row">
          <StatusBadge status={o.status} />
          <PaymentBadge status={o.payment_status} />
          <ReturnBadge status={o.return_status} />
          {LIVE.includes(o.status) && <button className="btn btn-outline btn-sm" onClick={reload}>↻ Refresh</button>}
        </div>
      </div>

      <div className="card mb">
        <h3>Order status</h3>
        <Timeline status={o.status} />
        {user.role === 'customer' && (
          <div className="mt"><CustomerActions order={o} onUpdated={setData} size="" /></div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Items</h3>
          <OrderItems order={o} />
          {o.notes && <p className="small muted">📝 {o.notes}</p>}
        </div>
        <div className="stack">
          <div className="card">
            <h3>Delivery</h3>
            <dl className="kv">
              <dt>Address</dt><dd>{o.delivery_address}</dd>
              <dt>Phone</dt><dd>{o.contact_phone || '—'}</dd>
              {o.customer?.name && user.role !== 'customer' && (<><dt>Customer</dt><dd>{o.customer.name}</dd></>)}
              <dt>Partner</dt><dd>{o.delivery_partner ? `${o.delivery_partner.name}${o.delivery_partner.phone ? ` · ${o.delivery_partner.phone}` : ''}` : 'Not assigned yet'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>Payments</h3>
            <table className="table">
              <tbody>
                {o.payments.map((p) => (
                  <tr key={p.id}>
                    <td><b>{label(p.entry_type)}</b><div className="small muted">{p.reference}</div></td>
                    <td className="small">{p.note}<div className="muted">{fmtDate(p.created_at)}</div></td>
                    <td className="nowrap" style={{ textAlign: 'right', color: p.entry_type === 'refund' ? 'var(--ok)' : undefined }}>
                      {p.entry_type === 'refund' ? '+' : ''}{money(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(o.return_status !== 'none' || o.review) && (
            <div className="card">
              {o.return_status !== 'none' && (<><h3>Return request</h3><p className="small"><ReturnBadge status={o.return_status} /> {o.return_reason}</p></>)}
              {o.review && (<><h3>Your review</h3><Stars value={o.review.rating} /> <span className="muted small">{o.review.comment}</span></>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
