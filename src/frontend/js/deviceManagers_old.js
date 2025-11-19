// src/deviceManagers.js
import hue from './hueManager';
import kasa from './kasaManager';
import matter from './matterManager';
import shelly from './shellyManager';
import ha from './homeAssistantManager';

const deviceManagers = {
    hue: {
        setup: hue.setupHue,              // async (io, notifier) => returns lights array
        control: hue.controlHueLight,     // async (deviceId, state) => { success, error }
        getDevices: () => hue.hueLights   // Access initialized devices
    },
    kasa: {
        setup: kasa.setupKasa,
        control: kasa.controlKasaDevice,
        getDevices: () => kasa.kasaManager.getDevices()
    },
    matter: {
        setup: matter.setupMatter,
        control: matter.controlMatterDevice,
        getDevices: () => matter.MatterManager.getDevices()
    },
    shelly: {
        setup: shelly.setupShelly,
        control: shelly.controlShellyDevice,
        getDevices: shelly.getShellyDevices
    },
    ha: {
        setup: ha.setupHomeAssistant,
        control: ha.controlHomeAssistantDevice,
        getDevices: () => ha.haManager.getDevices()
    }
};

async function initializeDevices(io, notificationEmitter) {
    const devices = {};
    for each type in deviceManagers:
        try {
            devices[type] = await deviceManagers[type].setup(io, notificationEmitter);
            log(`Initialized ${type} devices: ${devices[type].length}`);
        } catch (error) {
            log(`Failed to initialize ${type}: ${error.message}`);
            devices[type] = [];
        }
    return devices;
}

async function controlDevice(deviceId, state) {
    find type where deviceId starts with `${type}_`;
    if no type found:
        throw Error(`Unknown device type for ${deviceId}`);
    return deviceManagers[type].control(deviceId, state);
}

function getAllDevices() {
    return Object.keys(deviceManagers).reduce((acc, type) => {
        acc[type] = deviceManagers[type].getDevices();
        return acc;
    }, {});
}

export { initializeDevices, controlDevice, getAllDevices };