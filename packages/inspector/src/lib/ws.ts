import type { RuntimeEvent } from './types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface EventStreamHandle {
  status: WsStatus;
  close: () => void;
}

/**
 * Connect to the inspector's WS feed at `/events`. Subscribes the listener to
 * every runtime event. Auto-reconnects with backoff if the socket drops.
 */
export const connectEventStream = (
  onEvent: (event: RuntimeEvent) => void,
  onStatus: (status: WsStatus) => void,
): { close: () => void } => {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryDelay = 500;

  const connect = (): void => {
    if (closed) return;
    onStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/events`);
    ws.onopen = () => {
      retryDelay = 500;
      onStatus('open');
    };
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as RuntimeEvent;
        onEvent(parsed);
      } catch {
        // ignore malformed payloads — server bug, surface in console

        console.warn('inspector: dropped malformed event', event.data);
      }
    };
    ws.onclose = () => {
      onStatus('closed');
      if (closed) return;
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 8000);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      ws?.close();
    },
  };
};
