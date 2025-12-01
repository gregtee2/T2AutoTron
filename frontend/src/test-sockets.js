// Test file to verify socket patch is working
import { ClassicPreset } from "rete";
import "./sockets.js"; // Apply patch
import sockets from "./sockets.js";

console.log("=== Socket Test ===");

// Test 1: Check if singleton sockets exist
console.log("Singleton boolean socket:", sockets.boolean);
console.log("Singleton object socket:", sockets.object);

// Test 2: Check if patch is applied
const socket1 = new ClassicPreset.Socket("boolean");
const socket2 = new ClassicPreset.Socket("boolean");
const canConnect = ClassicPreset.Socket.canConnect(socket1, socket2);
console.log("Can two 'boolean' sockets connect?", canConnect);

// Test 3: Check if singleton sockets can connect
const canConnectSingleton = ClassicPreset.Socket.canConnect(sockets.boolean, sockets.boolean);
console.log("Can singleton boolean sockets connect?", canConnectSingleton);

// Test 4: Check if different name sockets can't connect
const socket3 = new ClassicPreset.Socket("object");
const canConnectDifferent = ClassicPreset.Socket.canConnect(socket1, socket3);
console.log("Can 'boolean' and 'object' sockets connect?", canConnectDifferent);

console.log("=== End Socket Test ===");
