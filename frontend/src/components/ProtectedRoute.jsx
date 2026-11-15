import { Navigate, useLocation } from 'react-router-dom';
import { HOME, useAuth } from '../context/AuthContext';
import { LoadingPage } from './ui';

/** Renders children only for logged-in users with one of the allowed roles. */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return children;
}
