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
    reconnectionAttempts: Infinity,  // Keep trying forever
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,      // Cap delay at 5 seconds
    timeout: 20000,                  // Connection timeout
    // Use both transports for ingress compatibility
    transports: ['websocket', 'polling'],
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
