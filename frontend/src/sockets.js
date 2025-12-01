// src/sockets.js
import { ClassicPreset } from "rete";

// CRITICAL FIX: Override canConnect to allow connection by socket name
// Save original method first
const originalCanConnect = ClassicPreset.Socket.canConnect;

// Override with our custom logic
ClassicPreset.Socket.canConnect = function (a, b) {
    // First try the original method (checks if same instance)
    if (originalCanConnect && originalCanConnect(a, b)) return true;

    // Allow "any" socket to connect to anything
    if (a.name === "any" || b.name === "any") return true;

    // Allow connection by socket name (fixes Vite HMR duplicate instances)
    return a.name === b.name;
};

// Singleton sockets
const sockets = {
    boolean: new ClassicPreset.Socket("boolean"),
    number: new ClassicPreset.Socket("number"),
    object: new ClassicPreset.Socket("object"),
    lightInfo: new ClassicPreset.Socket("light_info"),
    any: new ClassicPreset.Socket("any"),
};

export default sockets;