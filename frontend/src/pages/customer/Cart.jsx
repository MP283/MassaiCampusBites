import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { Alert, Button, Empty, dishEmoji, money } from '../../components/ui';

export default function Cart() {
  const { user } = useAuth();
  const { cart, subtotal, setQty, remove, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ delivery_address: user?.address || '', contact_phone: user?.phone || '', notes: '', method: 'dummy_card', card: '4242 4242 4242 4242' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (!cart.items.length) {
    return <Empty icon="🛒" title="Your cart is empty"><Link to="/restaurants" className="btn mt">Browse restaurants</Link></Empty>;
  }

  async function placeOrder(e) {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: '/cart' } });
    if (user.role !== 'customer') return setError('Only customer accounts can place orders.');
    setBusy(true);
    setError('');
    try {
      const digits = form.card.replace(/\D/g, '');
      const { data } = await api.post('/orders', {
        restaurant_id: cart.restaurant.id,
        items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
        delivery_address: form.delivery_address,
        contact_phone: form.contact_phone,
        notes: form.notes,
        payment: { method: form.method, card_last4: (digits.slice(-4) || '0000').padStart(4, '0') },
      });
      clear();
      navigate(`/orders/${data.id}?placed=1`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={placeOrder}>
      <h1>Checkout</h1>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="layout-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Items from {cart.restaurant.name}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear cart</button>
            </div>
            {cart.items.map((i) => (
              <div key={i.id} className="dish">
                <div className="dish-icon" style={{ width: 48, height: 48, fontSize: '1.4rem' }}>{dishEmoji(i.category)}</div>
                <div className="spacer">
                  <b>{i.name}</b>
                  <div className="small muted">{money(i.price)} each</div>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => setQty(i.id, i.quantity - 1)} aria-label="Decrease">−</button>
                  <span>{i.quantity}</span>
                  <button type="button" onClick={() => setQty(i.id, i.quantity + 1)} aria-label="Increase">+</button>
                </div>
                <b style={{ width: 80, textAlign: 'right' }}>{money(i.price * i.quantity)}</b>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>✕</button>
              </div>
            ))}
            <Link to={`/restaurants/${cart.restaurant.id}`} className="small">+ Add more items</Link>
          </div>
          <div className="card stack">
            <h3>Delivery details</h3>
            <label className="field">Delivery address<input type="text" required minLength={5} value={form.delivery_address} onChange={set('delivery_address')} placeholder="Hostel, room number, landmark" /></label>
            <div className="grid grid-2">
              <label className="field">Contact phone<input type="text" value={form.contact_phone} onChange={set('contact_phone')} /></label>
              <label className="field">Notes for the restaurant<input type="text" value={form.notes} onChange={set('notes')} placeholder="Less spicy please" /></label>
            </div>
          </div>
        </div>

        <aside className="card stack sticky-summary">
          <h3>Payment</h3>
          <div className="alert alert-info small" style={{ margin: 0 }}>🧪 Dummy payment: no real money is charged. The order will be marked <b>mock_paid</b>.</div>
          <label className="field">
            Method
            <select value={form.method} onChange={set('method')}>
              <option value="dummy_card">Dummy card</option>
              <option value="dummy_upi">Dummy UPI</option>
              <option value="cash_on_delivery">Cash on delivery (mock)</option>
            </select>
          </label>
          {form.method === 'dummy_card' && (
            <label className="field">Card number (any digits)<input type="text" value={form.card} onChange={set('card')} inputMode="numeric" /></label>
          )}
          <div className="row"><span className="spacer">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="row"><span className="spacer">Delivery fee</span><span className="muted">Free</span></div>
          <div className="row" style={{ fontSize: '1.15rem' }}><b className="spacer">Total</b><b>{money(subtotal)}</b></div>
          <Button type="submit" loading={busy} className="btn-lg btn-block">{user ? `Pay ${money(subtotal)} & place order` : 'Log in to place order'}</Button>
        </aside>
      </div>
    </form>
  );
}
