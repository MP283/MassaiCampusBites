import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks';
import { Alert, Empty, LoadingPage, Pagination, Stars, coverBg, cuisineEmoji } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function Restaurants() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [page, setPage] = useState(1);

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = { page, size: 12, ...(query && { search: query }), ...(cuisine && { cuisine }) };
  const { data, loading, error } = useFetch('/restaurants', params);
  const { data: cuisines } = useFetch('/restaurants/cuisines');

  return (
    <>
      <div className="hero-banner">
        <h1>{user ? `Hungry, ${user.name.split(' ')[0]}?` : 'Campus food, delivered fast'} 🍕</h1>
        <p>Order from your favourite campus restaurants and track it to your door.</p>
      </div>
      <div className="filters mb">
        <label className="field" style={{ flex: '3 1 260px' }}>
          <span className="small">Search restaurants or dishes</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try 'biryani' or 'pizza'" />
        </label>
        <label className="field">
          <span className="small">Cuisine</span>
          <select value={cuisine} onChange={(e) => { setCuisine(e.target.value); setPage(1); }}>
            <option value="">All cuisines</option>
            {(cuisines || []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <Alert>{error}</Alert>
      {loading && !data ? (
        <LoadingPage />
      ) : !data?.items.length ? (
        <Empty icon="🔍" title="No restaurants found">Try a different search.</Empty>
      ) : (
        <>
          <div className="grid grid-3">
            {data.items.map((r) => (
              <Link key={r.id} to={`/restaurants/${r.id}`} className="card rest-card">
                <div className="rest-cover" style={{ background: coverBg(r.id) }}>{cuisineEmoji(r.cuisine)}</div>
                <div className="rest-body">
                  <div className="row">
                    <h3 className="spacer" style={{ margin: 0 }}>{r.name}</h3>
                    {!r.is_open && <span className="badge badge-danger">Closed</span>}
                  </div>
                  <div className="small muted">{r.cuisine || 'Multi-cuisine'} · {r.item_count} dishes</div>
                  <div className="small">
                    {r.avg_rating ? <><Stars value={r.avg_rating} /> {r.avg_rating} ({r.review_count})</> : <span className="muted">No ratings yet</span>}
                  </div>
                  <div className="small muted">📍 {r.address || 'On campus'}</div>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
