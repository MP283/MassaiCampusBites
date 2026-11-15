import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { tokenStore } from '../api/client';

const AuthContext = createContext(null);

export const HOME = { customer: '/restaurants', owner: '/owner', delivery: '/delivery' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (tokenStore.get() ? tokenStore.getUser() : null));
  const [loading, setLoading] = useState(!!tokenStore.get());

  // Re-validate the stored token on load
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        tokenStore.setUser(data);
      })
      .catch(() => {
        tokenStore.set(null);
        tokenStore.setUser(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, u) => {
    tokenStore.set(token);
    tokenStore.setUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    tokenStore.setUser(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((u) => {
    tokenStore.setUser(u);
    setUser(u);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
