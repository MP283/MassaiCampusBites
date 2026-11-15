import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const LINKS = {
  customer: [
    ['/restaurants', 'Restaurants'],
    ['/orders', 'My orders'],
    ['/insights', '✨ AI insights'],
  ],
  owner: [
    ['/owner', 'Dashboard'],
    ['/owner/orders', 'Orders'],
    ['/owner/menu', 'Menu'],
    ['/owner/returns', 'Returns'],
  ],
  delivery: [['/delivery', 'Deliveries']],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const links = user ? LINKS[user.role] : [['/restaurants', 'Restaurants']];

  return (
    <header className="topnav">
      <div className="topnav-inner" style={{ position: 'relative' }}>
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">🍔</span> CampusBite
        </Link>
        <span className="spacer" />
        <button className="btn btn-outline btn-sm menu-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">☰</button>
        <nav className={`topnav-links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          {links.map(([to, text]) => (
            <NavLink key={to} to={to} end={to === '/owner'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {text}
            </NavLink>
          ))}
          {(!user || user.role === 'customer') && (
            <NavLink to="/cart" className={({ isActive }) => `nav-link cart-pill ${isActive ? 'active' : ''}`}>
              🛒 Cart {count > 0 && <span className="cart-count">{count}</span>}
            </NavLink>
          )}
          {user ? (
            <>
              <span className="small muted" style={{ padding: '0 8px' }}>
                {user.name} · <span style={{ textTransform: 'capitalize' }}>{user.role === 'owner' ? 'Restaurant owner' : user.role === 'delivery' ? 'Delivery partner' : 'Customer'}</span>
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">Log in</NavLink>
              <Link to="/register" className="btn btn-sm">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
