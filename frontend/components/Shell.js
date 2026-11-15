'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, useRequireRole } from '@/lib/auth';
import { LoadingPage } from './ui';

const NAV = {
  admin: [
    { href: '/admin', label: 'Dashboard', icon: '🏠', exact: true },
    { href: '/admin/uploads', label: 'Content', icon: '📄' },
    { href: '/admin/tests', label: 'Tests', icon: '📝' },
    { href: '/admin/teams', label: 'Teams', icon: '👥' },
    { href: '/admin/students', label: 'Students', icon: '🎓' },
    { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    { href: '/admin/settings', label: 'Branding', icon: '🎨' },
  ],
  student: [
    { href: '/student', label: 'My tests', icon: '📝', exact: true },
    { href: '/student/analytics', label: 'Performance', icon: '📊' },
    { href: '/change-password?self=1', label: 'Password', icon: '🔒' },
  ],
};

export default function Shell({ role, children }) {
  const { ready, user } = useRequireRole(role);
  const { logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState(null);

  // Clear the "navigating" highlight once the new page is shown
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  if (!ready) return <LoadingPage />;

  const items = NAV[role];
  const matches = (it, path) => (it.exact ? path === it.href : path.startsWith(it.href.split('?')[0]));
  const isActive = (it) => (pendingHref ? it.href === pendingHref : matches(it, pathname));

  return (
    <div className="shell">
      <div className="mobile-bar">
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(!open)} aria-label="Menu">
          ☰
        </button>
        <strong>AI Test Platform</strong>
        <span />
      </div>
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <Link href={role === 'admin' ? '/admin' : '/student'} className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">AI</span>
          <span>TestGen</span>
        </Link>
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`nav-link ${isActive(it) ? 'active' : ''}`}
            onClick={() => !matches(it, pathname) && setPendingHref(it.href)}
          >
            <span className="nav-icon" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </Link>
        ))}
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{(user.name || '?').charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div className="small muted" style={{ textTransform: 'capitalize' }}>
                {user.role}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-block mt" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
