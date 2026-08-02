import { io } from 'socket.io-client';

let socket;

/** Single shared socket connection per browser-source page, joined to the `client` room. */
export function getSocket() {
  if (socket) return socket;
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('client') || 'demo';
  socket = io('/', {
    query: { client: clientId },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getClientId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('client') || 'demo';
}
