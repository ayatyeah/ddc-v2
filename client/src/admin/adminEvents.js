import { useEffect, useRef } from 'react';

const ADMIN_DATA_CHANGED = 'ddc-admin-data-changed';
const CHANNEL_NAME = 'ddc-admin-sync';
const canBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window;

const channel = canBroadcast ? new BroadcastChannel(CHANNEL_NAME) : null;

export function emitAdminDataChange(scope = 'all') {
  if (typeof window === 'undefined') return;
  const detail = { scope, at: Date.now() };
  window.dispatchEvent(new CustomEvent(ADMIN_DATA_CHANGED, { detail }));
  channel?.postMessage(detail);
}

export function useAdminDataSync(load, { intervalMs = 0 } = {}) {
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onChange = (event) => {
      loadRef.current?.();
    };

    const onChannelMessage = () => {
      loadRef.current?.();
    };

    const onVisible = () => {
      if (!document.hidden) loadRef.current?.();
    };

    window.addEventListener(ADMIN_DATA_CHANGED, onChange);
    channel?.addEventListener('message', onChannelMessage);
    document.addEventListener('visibilitychange', onVisible);

    const timer = intervalMs > 0
      ? window.setInterval(() => { if (!document.hidden) loadRef.current?.(); }, intervalMs)
      : null;

    return () => {
      window.removeEventListener(ADMIN_DATA_CHANGED, onChange);
      channel?.removeEventListener('message', onChannelMessage);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [intervalMs]);
}