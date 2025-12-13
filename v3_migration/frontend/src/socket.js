import { io } from 'socket.io-client';
import { getApiBase } from './utils/apiBase';

// Default to the current origin so LAN access works (and Vite can proxy /socket.io to backend)
const URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

// Get ingress path for socket.io
const ingressPath = getApiBase();
const socketPath = ingressPath ? `${ingressPath}/socket.io` : '/socket.io';

export const socket = io(URL, {
    path: socketPath,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

export const connectSocket = () => {
    if (!socket.connected) {
        socket.connect();
    }
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};
