/**
 * HAGenericDevice.node.js - Unified Node Definition
 * 
 * Controls Home Assistant devices (lights, switches, etc.)
 * 
 * 🦴 Caveman Summary:
 * This node is the remote control for your smart home. You give it:
 * - A list of devices to control (lights, switches, etc.)
 * - A trigger signal (on/off)
 * - Optional color information (HSV)
 * 
 * When trigger goes ON, it tells those devices to turn ON.
 * When trigger goes OFF, it tells them to turn OFF.
 * 
 * DESIGN: This node is a thin logic wrapper. It:
 * 1. Reads inputs (trigger, HSV color)
 * 2. Decides what to do (based on trigger mode)
 * 3. Calls context.deviceManagers.homeAssistant.controlDevice() to do it
 * 4. Returns outputs (is_on state)
 * 
 * It does NOT make HTTP calls directly - all device control is delegated.
 */

module.exports = {
  // === IDENTITY ===
  id: 'HAGenericDeviceNode',
  version: '1.0.0',
  
  // === POC FLAG ===
  // Hidden from frontend context menu - backend engine uses this, frontend uses existing pretty UI
  hidden: true,
  
  // === UI METADATA ===
  label: 'HA Generic Device',
  category: 'Home Assistant',
  icon: '🏠',
  color: '#03a9f4',
  width: 420,
  height: 450,
  helpText: `Control Home Assistant devices (lights, switches, sensors).

Add one or more devices, then connect a trigger signal.

Trigger Modes:
• Follow: Device follows trigger state (default)
• Toggle: Each trigger pulse toggles device
• On: Only turns device on, never off
• Off: Only turns device off, never on`,

  // === INPUTS ===
  inputs: {
    trigger: {
      type: 'boolean',
      label: 'Trigger',
      description: 'ON/OFF signal to control device(s)'
    },
    hsv_info: {
      type: 'object',
      label: 'HSV Color',
      description: 'Optional color input { hue: 0-1, saturation: 0-1, brightness: 0-255 }'
    }
  },

  // === OUTPUTS ===
  outputs: {
    is_on: {
      type: 'boolean',
      label: 'Is On',
      description: 'Current on/off state of controlled device(s)'
    }
  },

  // === CONFIGURABLE PROPERTIES ===
  properties: {
    selectedDeviceIds: {
      type: 'array',
      default: [],
      label: 'Device IDs',
      description: 'List of Home Assistant entity IDs to control',
      uiType: 'device-picker'
    },
    selectedDeviceNames: {
      type: 'array',
      default: [],
      label: 'Device Names',
      description: 'Display names for selected devices',
      uiType: 'hidden'
    },
    triggerMode: {
      type: 'select',
      default: 'Follow',
      options: ['Follow', 'Toggle', 'On', 'Off'],
      label: 'Trigger Mode',
      description: 'How trigger signal controls devices',
      uiType: 'select'
    },
    transitionTime: {
      type: 'number',
      default: 1000,
      label: 'Transition (ms)',
      description: 'How quickly lights transition to new state',
      min: 0,
      max: 60000,
      uiType: 'number'
    }
  },

  // === INTERNAL STATE ===
  internalState: {
    lastTrigger: undefined,
    lastHsv: null,
    deviceStates: {},       // Track on/off state per device (for Toggle mode)
    tickCount: 0,           // For warmup period
    currentIsOn: false      // Last known on/off state
  },

  // === HELPER: Normalize entity ID (strip ha_ prefix) ===
  _normalizeEntityId(deviceId) {
    if (!deviceId) return null;
    return deviceId.startsWith('ha_') ? deviceId.slice(3) : deviceId;
  },

  // === HELPER: Get all entity IDs from properties ===
  _getEntityIds(properties) {
    const ids = [];
    
    if (Array.isArray(properties.selectedDeviceIds)) {
      properties.selectedDeviceIds.forEach(id => {
        const normalized = this._normalizeEntityId(id);
        if (normalized) ids.push(normalized);
      });
    }
    
    if (properties.deviceId) {
      const normalized = this._normalizeEntityId(properties.deviceId);
      if (normalized) ids.push(normalized);
    }
    
    return ids;
  },

  // === HELPER: Convert HSV to Home Assistant format ===
  _hsvToHAFormat(hsv) {
    if (!hsv) return null;
    
    return {
      hs_color: [
        Math.round((hsv.hue <= 1 ? hsv.hue : hsv.hue / 360) * 360),
        Math.round((hsv.saturation <= 1 ? hsv.saturation : hsv.saturation / 100) * 100)
      ],
      brightness: Math.round(
        hsv.brightness <= 1 ? hsv.brightness * 255 :
        hsv.brightness <= 255 ? hsv.brightness : 255
      )
    };
  },

  // === HELPER: Check if HSV values changed significantly ===
  _hsvChanged(newHsv, oldHsv) {
    if (!oldHsv) return !!newHsv;
    if (!newHsv) return false;
    
    return (
      Math.abs((newHsv.hue || 0) - (oldHsv.hue || 0)) > 0.01 ||
      Math.abs((newHsv.saturation || 0) - (oldHsv.saturation || 0)) > 0.01 ||
      Math.abs((newHsv.brightness || 0) - (oldHsv.brightness || 0)) > 1
    );
  },

  // === THE ACTUAL LOGIC ===
  /**
   * Execute function - determines what to do, then delegates to deviceManagers
   * 
   * This is an ASYNC function because it makes device control calls.
   * 
   * @param {Object} inputs - Input values
   * @param {Object} properties - Current property values
   * @param {Object} context - Runtime context with:
   *   - context.deviceManagers.homeAssistant - HA manager instance
   *   - context.isBackend - true if running in backend engine
   *   - context.now() - current time
   * @param {Object} state - Internal state that persists across executions
   * @returns {Object} - Output values { is_on: boolean }
   */
  async execute(inputs, properties, context, state) {
    // Get input values (handle both array and direct value formats)
    const trigger = inputs.trigger?.[0] ?? inputs.trigger;
    const hsv = inputs.hsv_info?.[0] ?? inputs.hsv_info;
    
    const entityIds = this._getEntityIds(properties);
    
    // No devices configured
    if (entityIds.length === 0) {
      return { is_on: false };
    }
    
    // Track ticks for warmup period
    state.tickCount = (state.tickCount || 0) + 1;
    
    // Warmup period: Skip first 3 ticks to let buffers populate
    // This prevents turning off devices when engine starts
    const WARMUP_TICKS = 3;
    if (state.tickCount <= WARMUP_TICKS) {
      // Initialize lastTrigger to current value without taking action
      if (trigger !== undefined) {
        state.lastTrigger = trigger;
      }
      return { 
        is_on: !!trigger || !!state.lastTrigger,
        _warmup: true,
        _tickCount: state.tickCount
      };
    }
    
    // Skip if trigger is still undefined (no connection)
    if (trigger === undefined) {
      return { is_on: !!state.lastTrigger };
    }
    
    // Get the Home Assistant manager (may be undefined in frontend/test)
    const haManager = context.deviceManagers?.homeAssistant;
    
    // Handle trigger changes
    const triggerChanged = trigger !== state.lastTrigger;
    
    if (triggerChanged) {
      const wasTriggered = state.lastTrigger;
      state.lastTrigger = trigger;
      
      const mode = properties.triggerMode || 'Follow';
      
      for (const entityId of entityIds) {
        let shouldTurnOn = null; // null = no action
        
        switch (mode) {
          case 'Follow':
            // Follow trigger state
            shouldTurnOn = !!trigger;
            break;
            
          case 'Toggle':
            // Toggle on rising edge only
            if (trigger && !wasTriggered) {
              state.deviceStates[entityId] = !state.deviceStates[entityId];
              shouldTurnOn = state.deviceStates[entityId];
            }
            break;
            
          case 'On':
            // Only turn on, never off
            if (trigger) {
              shouldTurnOn = true;
            }
            break;
            
          case 'Off':
            // Only turn off, never on
            if (trigger) {
              shouldTurnOn = false;
            }
            break;
        }
        
        if (shouldTurnOn !== null) {
          const colorData = shouldTurnOn ? this._hsvToHAFormat(hsv) : null;
          const transitionMs = properties.transitionTime || 1000;
          
          // Actually control the device via deviceManagers (if available)
          if (haManager) {
            try {
              await haManager.controlDevice(entityId, shouldTurnOn, {
                ...colorData,
                transition: transitionMs / 1000 // HA uses seconds
              });
            } catch (err) {
              // Log but don't crash - device control failures shouldn't break the graph
              console.warn(`[HAGenericDevice] Failed to control ${entityId}:`, err.message);
            }
          }
          
          state.deviceStates[entityId] = shouldTurnOn;
        }
      }
    }
    
    // Handle HSV changes while on (for Follow mode)
    if (state.lastTrigger && hsv && properties.triggerMode !== 'Toggle') {
      if (this._hsvChanged(hsv, state.lastHsv)) {
        state.lastHsv = { ...hsv };
        
        for (const entityId of entityIds) {
          const colorData = this._hsvToHAFormat(hsv);
          const transitionMs = properties.transitionTime || 1000;
          
          // Update color via deviceManagers (if available)
          if (haManager) {
            try {
              await haManager.controlDevice(entityId, true, {
                ...colorData,
                transition: transitionMs / 1000
              });
            } catch (err) {
              console.warn(`[HAGenericDevice] Failed to update color on ${entityId}:`, err.message);
            }
          }
        }
      }
    }
    
    // Update current state
    state.currentIsOn = !!state.lastTrigger;
    
    // Return simple output - no _pendingActions needed
    return {
      is_on: state.currentIsOn
    };
  },

  // === OPTIONAL: Validation ===
  validate(properties) {
    const errors = [];
    
    if (!properties.selectedDeviceIds || properties.selectedDeviceIds.length === 0) {
      errors.push('No devices selected');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
