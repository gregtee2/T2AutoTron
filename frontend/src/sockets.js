// src/sockets.js
import { ClassicPreset } from "rete";

console.log("[Sockets] Initializing socket patch...");

// CRITICAL FIX: Override canConnect to allow connection by socket name
// Save original method first
const originalCanConnect = ClassicPreset.Socket.canConnect;

// Override with our custom logic
ClassicPreset.Socket.canConnect = function (a, b) {
    console.log(`[Socket Check] ${a.name} <-> ${b.name}`);

    // First try the original method (checks if same instance)
    if (originalCanConnect && originalCanConnect(a, b)) {
        console.log("  -> Connected via original method (same instance)");
        return true;
    }

    // Allow "any" socket to connect to anything
    if (a.name === "any" || b.name === "any") {
        console.log("  -> Connected via 'any' wildcard");
        return true;
    }

    // Allow connection by socket name (fixes Vite HMR duplicate instances)
    const match = a.name === b.name;
    if (match) console.log("  -> Connected via name match");
    else console.log("  -> Connection failed");
    return match;
};

// CRITICAL FIX: Also patch the instance method which is often used by the UI/Plugin
ClassicPreset.Socket.prototype.canConnectTo = function (other) {
    console.log(`[Socket Instance Check] ${this.name} -> ${other.name}`);
    return ClassicPreset.Socket.canConnect(this, other);
};

// Singleton sockets
const sockets = {
    boolean: new ClassicPreset.Socket("boolean"),
    number: new ClassicPreset.Socket("number"),
    object: new ClassicPreset.Socket("object"),
    lightInfo: new ClassicPreset.Socket("light_info"),
    any: new ClassicPreset.Socket("any"),
};

// CRITICAL FIX: Directly attach method to instances to bypass prototype issues
Object.values(sockets).forEach(socket => {
    socket.canConnectTo = function (other) {
        console.log(`[Socket Instance Direct] ${this.name} -> ${other.name}`);
        return this.name === other.name || this.name === 'any' || other.name === 'any';
    };
});

export default sockets;