// File: globals/globals.js

// This module will hold and manage all global variables
const Globals = {
    apiKey: null,
    bridgeIp: null
};

// Function to set global variables
function setGlobal(key, value) {
    Globals[key] = value;
}

// Function to get global variables
function getGlobal(key) {
    return Globals[key];
}

// Exposing the functions and Globals object
export { Globals, setGlobal, getGlobal };
