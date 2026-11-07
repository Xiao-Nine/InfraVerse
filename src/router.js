import { useEffect, useState } from 'react';

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/twin';
  const [path, queryString = ''] = raw.split('?');
  return {
    path: path || '/twin',
    params: new URLSearchParams(queryString),
  };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '#/twin';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}