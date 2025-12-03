import { io } from 'socket.io-client';

// Default to localhost:3000 if not specified in env
const URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const socket = io(URL, {
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
