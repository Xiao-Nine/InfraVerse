import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const login = useCallback(async (username, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/api/auth/register', { method: 'POST', body: payload });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setUser }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}