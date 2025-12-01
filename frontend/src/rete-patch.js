// src/rete-patch.js
import { ClassicPreset } from "rete";

// PATCH: Allow connection if socket names match (fixes Vite duplicate instances)
const originalCanConnect = ClassicPreset.Socket.canConnect;
ClassicPreset.Socket.canConnect = (a, b) => {
  if (originalCanConnect(a, b)) return true;
  return a.name === b.name;
};