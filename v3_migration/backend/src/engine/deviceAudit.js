/**
 * deviceAudit.js
 * 
 * Tracks engine's intended device states and compares to actual HA states.
 * Logs mismatches periodically for debugging "wrong state" issues.
 * 
 * 🦴 CAVEMAN VERSION:
 * This is like a referee that checks if the lights are actually doing
 * what the engine told them to do. Every X minutes it compares 
 * "what engine thinks" vs "what HA reports" and yells about mismatches.
 */

const fetch = globalThis.fetch || require('node-fetch');
const engineLogger = require('./engineLogger');

// Track what the engine has sent to each device
// entityId → { on: boolean, brightness: number, hs_color: [h, s], lastUpdated: timestamp }
const engineIntendedStates = new Map();

// Audit configuration
const AUDIT_INTERVAL = 5 * 60 * 1000;  // 5 minutes
let auditIntervalId = null;

// Track previously logged mismatches to avoid repeating the same ones
// entityId → { issues: string[], lastLogged: timestamp }
const previouslyLoggedMismatches = new Map();

/**
 * Record what the engine intends for a device
 * Called whenever HAGenericDevice or similar sends a command
 */
function recordEngineIntent(entityId, state) {
  const rawId = entityId.replace('ha_', '');
  
  engineIntendedStates.set(rawId, {
    on: state.on ?? state.turnOn ?? (state.service === 'turn_on'),
    brightness: state.brightness,
    hs_color: state.hs_color,
    lastUpdated: Date.now(),
    lastPayload: state
  });
}

/**
 * Clear tracking for a device (e.g., when device is removed from node)
 */
function clearEngineIntent(entityId) {
  const rawId = entityId.replace('ha_', '');
  engineIntendedStates.delete(rawId);
}

/**
 * Get current tracking data for debugging
 */
function getTrackedDevices() {
  return Object.fromEntries(engineIntendedStates);
}

/**
 * Compare engine intent to actual HA state
 * @returns {object} Audit results with matches and mismatches
 */
async function runAudit() {
  const config = {
    host: process.env.HA_HOST || 'http://homeassistant.local:8123',
    token: process.env.HA_TOKEN || ''
  };

  if (!config.token) {
    return { success: false, error: 'No HA token configured' };
  }

  if (engineIntendedStates.size === 0) {
    return { success: true, message: 'No devices tracked', mismatches: [], matches: 0, total: 0 };
  }

  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    mismatches: [],
    matches: 0,
    total: 0,
    errors: []
  };

  try {
    // Fetch all states from HA at once (efficient)
    const response = await fetch(`${config.host}/api/states`, {
      headers: { 'Authorization': `Bearer ${config.token}` },
      timeout: 10000
    });

    if (!response.ok) {
      return { success: false, error: `HA API error: ${response.status}` };
    }

    const allStates = await response.json();
    const stateMap = new Map(allStates.map(s => [s.entity_id, s]));

    // Compare each tracked device
    for (const [entityId, intended] of engineIntendedStates) {
      results.total++;
      
      const actual = stateMap.get(entityId);
      if (!actual) {
        results.errors.push({ entityId, error: 'Entity not found in HA' });
        continue;
      }

      // Build comparison
      const comparison = {
        entityId,
        expected: {
          on: intended.on,
          brightness: intended.brightness,
          hs_color: intended.hs_color
        },
        actual: {
          on: actual.state === 'on',
          brightness: actual.attributes?.brightness,
          hs_color: actual.attributes?.hs_color
        },
        issues: [],
        lastEngineUpdate: new Date(intended.lastUpdated).toISOString(),
        staleness: Date.now() - intended.lastUpdated
      };

      // Check ON/OFF state
      const expectedOn = intended.on;
      const actualOn = actual.state === 'on';
      if (expectedOn !== actualOn) {
        comparison.issues.push(`State: expected ${expectedOn ? 'ON' : 'OFF'}, actual ${actualOn ? 'ON' : 'OFF'}`);
      }

      // Only check color/brightness if device is supposed to be ON
      if (expectedOn && actualOn) {
        // Check brightness (within tolerance)
        if (intended.brightness !== undefined && actual.attributes?.brightness !== undefined) {
          const expectedBri = intended.brightness;
          const actualBri = actual.attributes.brightness;
          // Allow 10% tolerance for brightness differences
          if (Math.abs(expectedBri - actualBri) > 25) {
            comparison.issues.push(`Brightness: expected ${expectedBri}, actual ${actualBri}`);
          }
        }

        // Check hue (within tolerance - hue wraps at 360)
        if (intended.hs_color && actual.attributes?.hs_color) {
          const expectedHue = intended.hs_color[0];
          const actualHue = actual.attributes.hs_color[0];
          // Allow 15 degree tolerance for hue
          const hueDiff = Math.abs(expectedHue - actualHue);
          const hueDiffWrapped = Math.min(hueDiff, 360 - hueDiff);
          if (hueDiffWrapped > 15) {
            comparison.issues.push(`Hue: expected ${expectedHue}°, actual ${actualHue}°`);
          }
        }
      }

      if (comparison.issues.length > 0) {
        results.mismatches.push(comparison);
      } else {
        results.matches++;
      }
    }

    return results;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Run audit and log results to engine log
 */
async function auditAndLog() {
  // Skip audit when frontend is active - user is manually controlling devices
  // Mismatches are expected and intentional in this mode
  try {
    const { engine } = require('./index');
    if (engine && engine.frontendActive) {
      // Frontend is in control - don't spam logs with expected mismatches
      return { success: true, skipped: true, reason: 'Frontend active' };
    }
  } catch (e) {
    // Engine not available, continue with audit
  }

  const results = await runAudit();
  
  if (!results.success) {
    engineLogger.log('AUDIT-ERROR', results.error || results.message);
    return results;
  }

  if (results.total === 0) {
    // No devices being tracked - no need to log
    return results;
  }

  // Log summary - but be quiet unless there are RECENT mismatches
  const summary = `${results.matches}/${results.total} OK, ${results.mismatches.length} mismatches`;
  
  // Only care about mismatches where we sent a command recently (< 30 min ago)
  // Stale mismatches (600+ min) mean user manually changed something - not our problem
  const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  const freshMismatches = results.mismatches.filter(m => m.staleness < STALE_THRESHOLD);
  
  if (freshMismatches.length === 0) {
    // All good (or only stale mismatches) - log to file only, not console
    engineLogger.log('AUDIT-OK', summary);
    // Removed console.log - too noisy. Check engineLogger for details.
    previouslyLoggedMismatches.clear();  // Reset tracking when all clear
  } else {
    // Filter out mismatches we've already logged (same device + same issues)
    const newMismatches = freshMismatches.filter(m => {
      const prev = previouslyLoggedMismatches.get(m.entityId);
      const issueKey = m.issues.sort().join('|');
      if (prev && prev.issueKey === issueKey) {
        // Same issue already logged - skip (unless it's been > 30 min)
        const timeSinceLog = Date.now() - prev.lastLogged;
        if (timeSinceLog < 30 * 60 * 1000) return false;
      }
      return true;
    });

    // Log new mismatches to file regardless
    engineLogger.log('AUDIT-MISMATCH', summary, { mismatches: freshMismatches });

    // Only console.log if there are NEW mismatches (not repeats)
    if (newMismatches.length > 0) {
      console.log(`[AUDIT] ⚠️ ${newMismatches.length} device mismatches (recent):`);
      for (const m of newMismatches) {
        const shortName = m.entityId.replace('light.', '').replace('switch.', '');
        const staleMin = Math.round(m.staleness / 60000);
        const issues = m.issues.join(', ');
        console.log(`  • ${shortName}: ${issues} (${staleMin}min ago)`);
        
        // Track that we logged this
        previouslyLoggedMismatches.set(m.entityId, {
          issueKey: m.issues.sort().join('|'),
          lastLogged: Date.now()
        });
      }
    }
  }

  return results;
}

/**
 * Start periodic auditing
 */
function startPeriodicAudit(intervalMs = AUDIT_INTERVAL) {
  if (auditIntervalId) {
    clearInterval(auditIntervalId);
  }
  
  console.log(`[AUDIT] Starting periodic audit every ${Math.round(intervalMs / 60000)} minutes`);
  engineLogger.log('AUDIT-START', `Interval: ${intervalMs}ms`);
  
  // Run immediately, then on interval
  setTimeout(() => auditAndLog(), 10000); // First audit after 10 seconds
  auditIntervalId = setInterval(() => auditAndLog(), intervalMs);
  
  // Ensure interval is ref'd to keep process alive
  if (auditIntervalId.ref) auditIntervalId.ref();
}

/**
 * Stop periodic auditing
 */
function stopPeriodicAudit() {
  if (auditIntervalId) {
    clearInterval(auditIntervalId);
    auditIntervalId = null;
    console.log('[AUDIT] Stopped periodic audit');
    engineLogger.log('AUDIT-STOP');
  }
}

module.exports = {
  recordEngineIntent,
  clearEngineIntent,
  getTrackedDevices,
  runAudit,
  auditAndLog,
  startPeriodicAudit,
  stopPeriodicAudit
};
