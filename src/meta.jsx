import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setUnauthorizedHandler } from './api.js';

const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const reload = useMemo(
    () => async () => {
      if (!getToken()) return;
      try {
        const data = await api('/api/meta');
        setMeta(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    [],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({ meta, error, reload }), [meta, error, reload]);
  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const value = useContext(MetaContext);
  if (!value) throw new Error('useMeta must be used inside MetaProvider');
  return value;
}

const EMPTY = {
  material_types: [],
  statuses: {},
  commands: {},
  health: {},
};

export function useMaterialTypes() {
  const { meta } = useMeta();
  return useMemo(() => {
    const source = meta || EMPTY;
    const types = Object.fromEntries((source.material_types || []).map((t) => [t.key, t]));
    return {
      types,
      statuses: source.statuses || {},
      commands: source.commands || {},
      health: source.health || {},
      room: source.room,
      version: source.version,
      simulateCommands: source.simulate_commands,
    };
  }, [meta]);
}