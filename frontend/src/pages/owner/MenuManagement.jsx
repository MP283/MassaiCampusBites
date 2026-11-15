import { useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useFetch } from '../../hooks';
import { Alert, Button, Empty, LoadingPage, Modal, dishEmoji, money } from '../../components/ui';

const EMPTY = { name: '', description: '', price: '', category: 'Main', is_veg: true, is_available: true };

export default function MenuManagement() {
  const { data: menu, loading, error, setData } = useFetch('/owner/menu');
  const [editing, setEditing] = useState(null); // null | {} (new) | dish
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [q, setQ] = useState('');

  const open = (dish) => {
    setEditing(dish || {});
    setForm(dish ? { ...dish, price: String(dish.price) } : EMPTY);
    setFormError('');
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const body = { name: form.name, description: form.description, price: Number(form.price), category: form.category, is_veg: form.is_veg, is_available: form.is_available };
    try {
      if (editing.id) {
        const { data } = await api.put(`/owner/menu/${editing.id}`, body);
        setData((m) => m.map((d) => (d.id === data.id ? data : d)));
      } else {
        const { data } = await api.post('/owner/menu', body);
        setData((m) => [...m, data]);
      }
      setEditing(null);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(dish) {
    try {
      const { data } = await api.patch(`/owner/menu/${dish.id}/availability`, null, { params: { is_available: !dish.is_available } });
      setData((m) => m.map((d) => (d.id === data.id ? data : d)));
    } catch (err) {
      setListError(errorMessage(err));
    }
  }

  async function remove(dish) {
    if (!window.confirm(`Delete "${dish.name}" from the menu?`)) return;
    try {
      await api.delete(`/owner/menu/${dish.id}`);
      setData((m) => m.filter((d) => d.id !== dish.id));
    } catch (err) {
      setListError(errorMessage(err));
    }
  }

  const list = (menu || []).filter((d) => `${d.name} ${d.category}`.toLowerCase().includes(q.toLowerCase()));
  const categories = [...new Set((menu || []).map((d) => d.category))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Menu management</h1>
          <p>Add dishes, edit prices and mark items available or unavailable.</p>
        </div>
        <div className="row">
          <input type="text" placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} aria-label="Search dishes" />
          <button className="btn" onClick={() => open(null)}>+ Add dish</button>
        </div>
      </div>
      <Alert>{error}</Alert>
      <Alert onClose={() => setListError('')}>{listError}</Alert>
      <div className="card">
        {loading && !menu ? <LoadingPage /> : !list.length ? <Empty icon="🍽️" title="No dishes yet">Click “Add dish” to create your menu.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Dish</th><th>Category</th><th>Price</th><th>Available</th><th /></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} style={{ opacity: d.is_available ? 1 : 0.6 }}>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <span style={{ fontSize: '1.4rem' }}>{dishEmoji(d.category)}</span>
                        <div><span className={`veg-dot ${d.is_veg ? '' : 'nonveg'}`} /> <b>{d.name}</b><div className="small muted">{d.description}</div></div>
                      </div>
                    </td>
                    <td>{d.category}</td>
                    <td className="nowrap"><b>{money(d.price)}</b></td>
                    <td>
                      <label className="switch" title={d.is_available ? 'Available' : 'Unavailable'}>
                        <input type="checkbox" checked={d.is_available} onChange={() => toggle(d)} aria-label={`Toggle availability of ${d.name}`} />
                        <span className="slider" />
                      </label>
                    </td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => open(d)}>Edit</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add a dish'}>
        <Alert onClose={() => setFormError('')}>{formError}</Alert>
        <form className="stack" onSubmit={save}>
          <label className="field">Name<input type="text" required value={form.name} onChange={set('name')} /></label>
          <div className="grid grid-2">
            <label className="field">Price (₹)<input type="number" required min={1} step="0.01" value={form.price} onChange={set('price')} /></label>
            <label className="field">Category<input type="text" required list="cats" value={form.category} onChange={set('category')} /></label>
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <label className="field">Description<textarea rows={2} value={form.description} onChange={set('description')} /></label>
          <div className="row">
            <label className="check"><input type="checkbox" checked={form.is_veg} onChange={set('is_veg')} /> Vegetarian</label>
            <label className="check"><input type="checkbox" checked={form.is_available} onChange={set('is_available')} /> Available</label>
          </div>
          <Button type="submit" loading={busy}>{editing?.id ? 'Save changes' : 'Add dish'}</Button>
        </form>
      </Modal>
    </>
  );
}
