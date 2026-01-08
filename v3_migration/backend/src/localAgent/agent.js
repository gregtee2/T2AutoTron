/**
 * T2AutoTron Local Agent
 * 
 * A lightweight helper that runs on your desktop/laptop, allowing the
 * T2 web UI (even when served from a Pi) to start local processes like Chatterbox.
 * 
 * 🦴 Caveman Version:
 * Web browsers can't start programs on your computer (security).
 * This agent listens on localhost and starts stuff when the UI asks.
 * 
 * Usage:
 *   node agent.js                    # Start agent on default port 5050
 *   node agent.js --port 5051        # Use different port
 * 
 * Endpoints:
 *   GET  /status           - Check if agent is running
 *   GET  /chatterbox/status - Check if Chatterbox is running
 *   POST /chatterbox/start  - Start Chatterbox server
 *   POST /chatterbox/stop   - Stop Chatterbox server
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const PORT = parseInt(process.argv.find((_, i, arr) => arr[i-1] === '--port') || '5050');
const CHATTERBOX_DIR = 'C:\\Chatterbox';
const CHATTERBOX_SCRIPT = path.join(CHATTERBOX_DIR, 'server.py');
const CHATTERBOX_PYTHON = path.join(CHATTERBOX_DIR, 'venv', 'Scripts', 'python.exe');

// State
let chatterboxProcess = null;
let chatterboxPort = 8100;

/**
 * Check if Chatterbox is responding
 * Note: Chatterbox can take 20-30 seconds to respond during GPU model loading
 */
async function isChatterboxRunning() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: chatterboxPort,
      path: '/',  // Root endpoint returns status JSON
      method: 'GET',
      timeout: 5000  // Longer timeout for slow startup
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Start Chatterbox server
 */
async function startChatterbox() {
  // Check if already running
  if (await isChatterboxRunning()) {
    return { success: true, message: 'Chatterbox already running', alreadyRunning: true };
  }

  // Check if script exists
  if (!fs.existsSync(CHATTERBOX_SCRIPT)) {
    return { 
      success: false, 
      error: `Chatterbox script not found at: ${CHATTERBOX_SCRIPT}`,
      hint: 'Update CHATTERBOX_DIR in agent.js to point to your Chatterbox installation'
    };
  }

  return new Promise((resolve) => {
    try {
      // Determine Python executable
      const pythonExe = fs.existsSync(CHATTERBOX_PYTHON) ? CHATTERBOX_PYTHON : 'python';
      console.log(`[Agent] Starting Chatterbox with: ${pythonExe}`);
      
      // Start Chatterbox with Python
      // Set PYTHONIOENCODING to handle Unicode emojis in output
      chatterboxProcess = spawn(pythonExe, [CHATTERBOX_SCRIPT], {
        cwd: CHATTERBOX_DIR,
        stdio: 'pipe',
        detached: false,
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        }
      });

      chatterboxProcess.stdout.on('data', (data) => {
        console.log(`[Chatterbox] ${data.toString().trim()}`);
      });

      chatterboxProcess.stderr.on('data', (data) => {
        console.log(`[Chatterbox] ${data.toString().trim()}`);
      });

      chatterboxProcess.on('error', (err) => {
        console.error('[Chatterbox] Failed to start:', err.message);
        chatterboxProcess = null;
      });

      chatterboxProcess.on('exit', (code) => {
        console.log(`[Chatterbox] Process exited with code ${code}`);
        chatterboxProcess = null;
      });

      // Wait a moment then check if it started
      setTimeout(async () => {
        const running = await isChatterboxRunning();
        if (running) {
          resolve({ success: true, message: 'Chatterbox started successfully' });
        } else {
          resolve({ 
            success: true, 
            message: 'Chatterbox process started, may still be initializing',
            note: 'GPU models take 10-30 seconds to load'
          });
        }
      }, 3000);

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Stop Chatterbox server
 */
async function stopChatterbox() {
  let killed = false;
  
  if (chatterboxProcess) {
    // Kill the managed process and all children
    if (process.platform === 'win32') {
      // On Windows, kill the process tree
      exec(`taskkill /F /T /PID ${chatterboxProcess.pid}`, () => {});
    } else {
      chatterboxProcess.kill('SIGTERM');
    }
    chatterboxProcess = null;
    killed = true;
  }

  // Also kill any process using port 8100
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Find and kill process on port 8100
      exec('netstat -ano | findstr ":8100.*LISTEN"', (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\n');
          const pids = new Set();
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 0) {
              pids.add(parts[parts.length - 1]);
            }
          });
          pids.forEach(pid => {
            if (pid && pid !== '0') {
              exec(`taskkill /F /T /PID ${pid}`, () => {});
            }
          });
        }
        resolve({ success: true, message: killed ? 'Chatterbox stopped' : 'Killed process on port 8100' });
      });
    } else {
      exec('pkill -f server.py', (err) => {
        resolve({ success: !err || killed, message: killed ? 'Chatterbox stopped' : 'Attempted to stop' });
      });
    }
  });
}

/**
 * Handle CORS for browser requests
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Send JSON response
 */
function sendJson(res, data, status = 200) {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * HTTP request handler
 */
async function handleRequest(req, res) {
  const url = req.url;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  console.log(`[Agent] ${method} ${url}`);

  try {
    // GET /status - Agent status
    if (url === '/status' && method === 'GET') {
      sendJson(res, { 
        agent: 'T2AutoTron Local Agent',
        version: '1.0.0',
        running: true,
        platform: process.platform,
        chatterboxConfigured: fs.existsSync(CHATTERBOX_SCRIPT)
      });
      return;
    }

    // GET /chatterbox/status - Chatterbox status
    if (url === '/chatterbox/status' && method === 'GET') {
      const running = await isChatterboxRunning();
      sendJson(res, { 
        running,
        port: chatterboxPort,
        processManaged: chatterboxProcess !== null
      });
      return;
    }

    // POST /chatterbox/start - Start Chatterbox
    if (url === '/chatterbox/start' && method === 'POST') {
      const result = await startChatterbox();
      sendJson(res, result, result.success ? 200 : 500);
      return;
    }

    // POST /chatterbox/stop - Stop Chatterbox
    if (url === '/chatterbox/stop' && method === 'POST') {
      const result = await stopChatterbox();
      sendJson(res, result);
      return;
    }

    // 404 for unknown routes
    sendJson(res, { error: 'Not found' }, 404);

  } catch (err) {
    console.error('[Agent] Error:', err);
    sendJson(res, { error: err.message }, 500);
  }
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, 'localhost', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     T2AutoTron Local Agent Running         ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  URL: http://localhost:${PORT}                 ║`);
  console.log('║                                            ║');
  console.log('║  Endpoints:                                ║');
  console.log('║    GET  /status            - Agent status  ║');
  console.log('║    GET  /chatterbox/status - CB status     ║');
  console.log('║    POST /chatterbox/start  - Start CB      ║');
  console.log('║    POST /chatterbox/stop   - Stop CB       ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log(`Chatterbox path: ${CHATTERBOX_DIR}`);
  console.log(`Script exists: ${fs.existsSync(CHATTERBOX_SCRIPT)}`);
  console.log(`Venv Python: ${fs.existsSync(CHATTERBOX_PYTHON) ? 'Found' : 'Not found (will use system python)'}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Agent] Shutting down...');
  if (chatterboxProcess) {
    chatterboxProcess.kill('SIGTERM');
  }
  server.close(() => {
    console.log('[Agent] Goodbye!');
    process.exit(0);
  });
});
