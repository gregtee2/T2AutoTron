// src/sockets.js
import { ClassicPreset } from "rete";

// Debug mode - uncomment to debug socket connection issues
const SOCKET_DEBUG = true;
// const SOCKET_DEBUG = false;
const socketDebug = (...args) => SOCKET_DEBUG && console.log(...args);

socketDebug("[Sockets] Initializing socket patch...");

// CRITICAL FIX: Override canConnect to allow connection by socket name
// Save original method first
const originalCanConnect = ClassicPreset.Socket.canConnect;

// Override with our custom logic
// Socket type compatibility rules:
// - Same type always connects
// - 'boolean' is STRICT - only connects to boolean (prevents accidental triggers)
// - 'any' connects to anything EXCEPT strict boolean (type safety for triggers)
// - 'string' and 'number' are mutually compatible (auto-conversion)
// - 'object' accepts most types
ClassicPreset.Socket.canConnect = function (a, b) {
    socketDebug(`[Socket Check] ${a.name} <-> ${b.name}`);

    // First try the original method (checks if same instance)
    if (originalCanConnect && originalCanConnect(a, b)) {
        socketDebug("  -> Connected via original method (same instance)");
        return true;
    }

    // Same type always matches
    if (a.name === b.name) {
        socketDebug("  -> Connected via name match");
        return true;
    }

    // 'any' is a TRUE WILDCARD - can connect to ANYTHING
    // This allows Inject/Receiver nodes (any output) to connect to any input type
    if (a.name === "any" || b.name === "any") {
        socketDebug("  -> Connected via 'any' wildcard (universal)");
        return true;
    }

    // Boolean is STRICT - only boolean<->boolean allowed (any already handled above)
    // This prevents string/number from accidentally triggering boolean inputs
    if (a.name === "boolean" || b.name === "boolean") {
        socketDebug("  -> Connection BLOCKED - boolean requires exact match");
        return false;
    }

    // HSV-related sockets are all compatible with each other
    // Some nodes use 'hsv_info', others use 'object' - they're both HSV data
    const hsvTypes = ['object', 'hsv_info', 'light_info'];
    if (hsvTypes.includes(a.name) && hsvTypes.includes(b.name)) {
        socketDebug("  -> Connected via HSV/object compatibility");
        return true;
    }

    // String sockets also accept number (auto-convert to string)
    if ((a.name === "string" && b.name === "number") || (a.name === "number" && b.name === "string")) {
        socketDebug("  -> Connected via string/number compatibility");
        return true;
    }

    socketDebug("  -> Connection BLOCKED - incompatible types");
    return false;
};

// CRITICAL FIX: Also patch the instance method which is often used by the UI/Plugin
ClassicPreset.Socket.prototype.canConnectTo = function (other) {
    socketDebug(`[Socket Instance Check] ${this.name} -> ${other.name}`);
    return ClassicPreset.Socket.canConnect(this, other);
};

// Singleton sockets
const sockets = {
    boolean: new ClassicPreset.Socket("boolean"),
    number: new ClassicPreset.Socket("number"),
    string: new ClassicPreset.Socket("string"),
    object: new ClassicPreset.Socket("object"),
    lightInfo: new ClassicPreset.Socket("light_info"),
    any: new ClassicPreset.Socket("any"),
};

// CRITICAL FIX: Directly attach method to instances to bypass prototype issues
Object.values(sockets).forEach(socket => {
    socket.canConnectTo = function (other) {
        socketDebug(`[Socket Instance Direct] ${this.name} -> ${other.name}`);
        // Same type always matches
        if (this.name === other.name) return true;
        // 'any' is TRUE WILDCARD - can connect to ANYTHING (Inject/Receiver use case)
        if (this.name === 'any' || other.name === 'any') return true;
        // Boolean is STRICT - only boolean<->boolean (any already handled above)
        if (this.name === 'boolean' || other.name === 'boolean') return false;
        // HSV-related sockets are all compatible (hsv_info, object, light_info)
        const hsvTypes = ['object', 'hsv_info', 'light_info'];
        if (hsvTypes.includes(this.name) && hsvTypes.includes(other.name)) return true;
        // String/Number are compatible (auto-conversion)
        if ((this.name === 'string' && other.name === 'number') || 
            (this.name === 'number' && other.name === 'string')) return true;
        // Default: incompatible
        return false;
    };
});

export default sockets;