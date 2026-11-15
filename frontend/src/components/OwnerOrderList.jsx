import { Link } from 'react-router-dom';
import OrderItems from './OrderItems';
import OwnerOrderActions from './OwnerOrderActions';
import { Empty, PaymentBadge, ReturnBadge, StatusBadge, fmtDate, money } from './ui';

export default function OwnerOrderList({ orders, partners, onUpdated, emptyText = 'No orders found' }) {
  if (!orders.length) return <Empty icon="🧾" title={emptyText} />;
  return (
    <div className="stack">
      {orders.map((o) => (
        <div key={o.id} className="card order-card">
          <div className="order-head">
            <Link to={`/orders/${o.id}`}><b>#{o.id}</b></Link>
            <span className="small muted">{fmtDate(o.created_at)} · {o.customer?.name}</span>
            <span className="spacer" />
            <StatusBadge status={o.status} />
            <PaymentBadge status={o.payment_status} />
            <ReturnBadge status={o.return_status} />
          </div>
          <div className="row mt" style={{ alignItems: 'flex-start' }}>
            <div className="spacer" style={{ minWidth: 220 }}>
              <OrderItems order={o} compact />
              <div className="small mt">📍 {o.delivery_address} {o.contact_phone && `· 📞 ${o.contact_phone}`}</div>
              {o.notes && <div className="small muted">📝 {o.notes}</div>}
              {o.delivery_partner && <div className="small">🛵 {o.delivery_partner.name}</div>}
              <div className="mt"><b>{money(o.total_amount)}</b></div>
            </div>
            <OwnerOrderActions order={o} partners={partners} onUpdated={onUpdated} />
          </div>
        </div>
      ))}
    </div>
  );
}
