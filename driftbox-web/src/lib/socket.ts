import { io, Socket } from 'socket.io-client';

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL || 'http://localhost:3004';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = localStorage.getItem('accessToken');
    socket = io(SYNC_URL, {
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const reconnectSocket = () => {
  disconnectSocket();
  return getSocket();
};