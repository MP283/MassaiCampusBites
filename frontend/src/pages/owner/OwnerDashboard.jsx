import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useFetch } from '../../hooks';
import OwnerOrderList from '../../components/OwnerOrderList';
import { Alert, Button, LoadingPage, Modal, Stat, StatusBadge, fmtDate, money } from '../../components/ui';

export default function OwnerDashboard() {
  const { data: restaurant, setData: setRestaurant } = useFetch('/owner/restaurant');
  const { data: stats, error, reload: reloadStats } = useFetch('/owner/stats', { days: 7 });
  const { data: reminders, reload: reloadReminders, setData: setReminders } = useFetch('/owner/reminders');
  const { data: incoming, reload: reloadIncoming, setData: setIncoming } = useFetch('/owner/orders', { status: 'PLACED', size: 5 });
  const { data: partners } = useFetch('/owner/delivery-partners');
  const [editing, setEditing] = useState(false);

  // light auto-refresh so new orders and reminders show up
  useEffect(() => {
    const t = setInterval(() => {
      reloadIncoming();
      reloadReminders();
    }, 30000);
    return () => clearInterval(t);
  }, [reloadIncoming, reloadReminders]);

  async function resolve(id) {
    await api.post(`/owner/reminders/${id}/resolve`);
    setReminders((r) => r.filter((x) => x.id !== id));
  }

  if (error) return <Alert>{error}</Alert>;
  if (!stats || !restaurant) return <LoadingPage />;
  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.orders));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{restaurant.name}</h1>
          <p>
            {restaurant.cuisine} · {restaurant.is_open ? <span className="badge badge-ok">Open</span> : <span className="badge badge-danger">Closed</span>}
          </p>
        </div>
        <div className="row">
          <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit restaurant</button>
          <Link className="btn btn-outline" to="/owner/menu">Manage menu</Link>
          <Link className="btn" to="/owner/orders">All orders</Link>
        </div>
      </div>

      {reminders?.length > 0 && (
        <div className="card mb" style={{ borderColor: 'var(--warn)' }}>
          <div className="card-head">
            <h3>⏰ Reminders ({reminders.length})</h3>
            <span className="small muted">Orders not updated for over 15 minutes</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {reminders.map((r) => (
              <div key={r.id} className="alert alert-warn row" style={{ margin: 0 }}>
                <span className="spacer">{r.message} <span className="small">({fmtDate(r.created_at)})</span></span>
                <Link to="/owner/orders" className="btn btn-sm btn-outline">Open orders</Link>
                <button className="btn btn-ghost btn-sm" onClick={() => resolve(r.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-4">
        <Stat label="Orders today" value={stats.orders_today} sub={`${stats.total_orders} all time`} icon="🧾" />
        <Stat label="Revenue today" value={money(stats.revenue_today)} sub={`${money(stats.revenue)} all time`} icon="💰" />
        <Stat label="Pending orders" value={stats.pending_orders} sub={`${stats.pending_returns} return request(s)`} icon="⏳" />
        <Stat label="Rating" value={stats.average_rating ? `${stats.average_rating} ★` : '—'} sub={`${stats.review_count} reviews · AOV ${money(stats.average_order_value)}`} icon="⭐" />
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <h3>Orders - last 7 days</h3>
          {stats.daily.map((d) => (
            <div key={d.date} className="bar-row">
              <span className="muted">{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
              <div className="bar"><div style={{ width: `${(100 * d.orders) / maxDaily}%` }} /></div>
              <span>{d.orders} · {money(d.revenue)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Top dishes</h3>
          {!stats.top_items.length ? <p className="muted small">No sales yet.</p> : (
            <table className="table">
              <tbody>
                {stats.top_items.map((t, i) => (
                  <tr key={t.name}><td>{i + 1}. {t.name}</td><td>{t.quantity} sold</td><td style={{ textAlign: 'right' }}>{money(t.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="mt">Orders by status</h3>
          <div className="row" style={{ gap: 6 }}>
            {Object.entries(stats.status_counts).map(([s, c]) => <span key={s}><StatusBadge status={s} /> <b className="small">{c}</b></span>)}
          </div>
        </div>
      </div>

      <div className="card-head mt" style={{ marginTop: 24 }}>
        <h2>New orders waiting for you</h2>
        <button className="btn btn-outline btn-sm" onClick={() => { reloadIncoming(); reloadStats(); }}>↻ Refresh</button>
      </div>
      {!incoming ? <LoadingPage /> : (
        <OwnerOrderList orders={incoming.items} partners={partners} emptyText="No new orders right now"
          onUpdated={(o) => { setIncoming((d) => ({ ...d, items: d.items.filter((x) => x.id !== o.id) })); reloadStats(); reloadReminders(); }} />
      )}

      <EditRestaurant open={editing} restaurant={restaurant} onClose={() => setEditing(false)} onSaved={(r) => { setRestaurant(r); setEditing(false); }} />
    </>
  );
}

function EditRestaurant({ open, restaurant, onClose, onSaved }) {
  const [form, setForm] = useState(restaurant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm(restaurant), [restaurant, open]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { name, description, cuisine, address, image_url, is_open } = form;
      const { data } = await api.put('/owner/restaurant', { name, description, cuisine, address, image_url, is_open });
      onSaved(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit restaurant">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <form className="stack" onSubmit={save}>
        <label className="field">Name<input type="text" required value={form.name} onChange={set('name')} /></label>
        <div className="grid grid-2">
          <label className="field">Cuisine<input type="text" value={form.cuisine} onChange={set('cuisine')} /></label>
          <label className="field">Address<input type="text" value={form.address} onChange={set('address')} /></label>
        </div>
        <label className="field">Description<textarea rows={3} value={form.description} onChange={set('description')} /></label>
        <label className="check"><input type="checkbox" checked={form.is_open} onChange={set('is_open')} /> Open for orders</label>
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Modal>
  );
}

