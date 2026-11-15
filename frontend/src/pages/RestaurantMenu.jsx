import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Alert, Empty, LoadingPage, Stars, coverBg, cuisineEmoji, dishEmoji, fmtDate, money } from '../components/ui';

export default function RestaurantMenu() {
  const { id } = useParams();
  const { user } = useAuth();
  const { cart, count, subtotal, qtyOf, add, setQty } = useCart();
  const [filters, setFilters] = useState({ search: '', min_price: '', max_price: '', veg_only: false, sort: 'category' });
  const [debounced, setDebounced] = useState(filters);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 250);
    return () => clearTimeout(t);
  }, [filters]);

  const { data: restaurant, loading: rLoading, error: rError } = useFetch(`/restaurants/${id}`);
  const params = useMemo(() => {
    const p = { sort: debounced.sort };
    if (debounced.search.trim()) p.search = debounced.search.trim();
    if (debounced.min_price !== '') p.min_price = debounced.min_price;
    if (debounced.max_price !== '') p.max_price = debounced.max_price;
    if (debounced.veg_only) p.veg_only = true;
    return p;
  }, [debounced]);
  const { data: menu, loading, error } = useFetch(`/restaurants/${id}/menu`, params);
  const { data: reviews } = useFetch(`/restaurants/${id}/reviews`, { limit: 5 });

  const canOrder = !user || user.role === 'customer';
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function addDish(dish) {
    if (cart.restaurant && cart.restaurant.id !== restaurant.id && !window.confirm(`Your cart has items from ${cart.restaurant.name}. Start a new cart with ${restaurant.name}?`)) return;
    add(restaurant, dish);
    setNotice(`Added ${dish.name}`);
    setTimeout(() => setNotice(''), 1500);
  }

  if (rError) return <Alert>{rError}</Alert>;
  if (rLoading || !restaurant) return <LoadingPage />;

  const grouped = {};
  (menu || []).forEach((d) => {
    const k = filters.sort === 'category' ? d.category : 'Dishes';
    (grouped[k] = grouped[k] || []).push(d);
  });
  const inThisCart = cart.restaurant?.id === restaurant.id;

  return (
    <>
      <div className="small mb"><Link to="/restaurants">← All restaurants</Link></div>
      <div className="card row mb" style={{ gap: 18 }}>
        <div className="rest-cover" style={{ background: coverBg(restaurant.id), width: 100, height: 100, borderRadius: 16 }}>{cuisineEmoji(restaurant.cuisine)}</div>
        <div className="spacer stack" style={{ gap: 4 }}>
          <div className="row">
            <h1 style={{ margin: 0 }}>{restaurant.name}</h1>
            {!restaurant.is_open && <span className="badge badge-danger">Closed now</span>}
          </div>
          <div className="muted">{restaurant.cuisine} · 📍 {restaurant.address}</div>
          <div>{restaurant.avg_rating ? <><Stars value={restaurant.avg_rating} /> <b>{restaurant.avg_rating}</b> <span className="muted small">({restaurant.review_count} reviews)</span></> : <span className="muted small">No ratings yet</span>}</div>
          {restaurant.description && <p className="small muted" style={{ margin: 0 }}>{restaurant.description}</p>}
        </div>
      </div>

      <div className="layout-2">
        <div>
          <div className="card mb">
            <div className="filters">
              <label className="field" style={{ flex: '2 1 200px' }}>
                <span className="small">Search dishes</span>
                <input type="text" value={filters.search} onChange={set('search')} placeholder="Dish name" />
              </label>
              <label className="field"><span className="small">Min price (₹)</span><input type="number" min={0} value={filters.min_price} onChange={set('min_price')} /></label>
              <label className="field"><span className="small">Max price (₹)</span><input type="number" min={0} value={filters.max_price} onChange={set('max_price')} /></label>
              <label className="field">
                <span className="small">Sort</span>
                <select value={filters.sort} onChange={set('sort')}>
                  <option value="category">Category</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <label className="check" style={{ flex: '0 0 auto', paddingBottom: 10 }}>
                <input type="checkbox" checked={filters.veg_only} onChange={set('veg_only')} /> Veg only
              </label>
            </div>
          </div>
          <Alert>{error}</Alert>
          {notice && <Alert type="ok">{notice} ✓</Alert>}
          <div className="card">
            {loading && !menu ? <LoadingPage /> : !menu?.length ? (
              <Empty icon="🍽️" title="No dishes match your filters" />
            ) : (
              Object.entries(grouped).map(([cat, dishes]) => (
                <div key={cat}>
                  <h3 style={{ marginTop: 8 }}>{cat} <span className="small muted">({dishes.length})</span></h3>
                  {dishes.map((d) => {
                    const q = qtyOf(d.id);
                    return (
                      <div key={d.id} className="dish" style={{ opacity: d.is_available ? 1 : 0.55 }}>
                        <div className="dish-icon">{dishEmoji(d.category)}</div>
                        <div className="spacer">
                          <div className="row" style={{ gap: 6 }}>
                            <span className={`veg-dot ${d.is_veg ? '' : 'nonveg'}`} title={d.is_veg ? 'Veg' : 'Non-veg'} />
                            <b>{d.name}</b>
                          </div>
                          <div style={{ fontWeight: 600 }}>{money(d.price)}</div>
                          <div className="small muted">{d.description}</div>
                        </div>
                        {canOrder && (
                          !d.is_available || !restaurant.is_open ? (
                            <span className="badge badge-muted">{d.is_available ? 'Closed' : 'Unavailable'}</span>
                          ) : inThisCart && q > 0 ? (
                            <div className="qty">
                              <button onClick={() => setQty(d.id, q - 1)} aria-label="Decrease">−</button>
                              <span>{q}</span>
                              <button onClick={() => setQty(d.id, q + 1)} aria-label="Increase">+</button>
                            </div>
                          ) : (
                            <button className="btn btn-outline btn-sm" onClick={() => addDish(d)}>Add +</button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="stack sticky-summary">
          {canOrder && (
            <div className="card">
              <h3>🛒 Your cart</h3>
              {count === 0 ? <p className="muted small">Your cart is empty. Add some dishes!</p> : (
                <>
                  <p className="small muted">{count} item(s) from <b>{cart.restaurant.name}</b></p>
                  <div className="row"><span className="spacer">Subtotal</span><b>{money(subtotal)}</b></div>
                  <Link to="/cart" className="btn btn-block mt">Go to checkout →</Link>
                </>
              )}
            </div>
          )}
          <div className="card">
            <h3>Recent reviews</h3>
            {!reviews?.length ? <p className="muted small">No reviews yet.</p> : reviews.map((r) => (
              <div key={r.id} className="small" style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                <Stars value={r.rating} /> <b>{r.customer_name}</b> <span className="muted">· {fmtDate(r.created_at)}</span>
                {r.comment && <div className="muted">{r.comment}</div>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
