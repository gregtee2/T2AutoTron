#!/usr/bin/env python3
"""
T2AutoTron Local Agent (Python version)
========================================
This agent runs on your desktop and allows the T2 web UI (even when hosted 
on a remote device like a Raspberry Pi) to control local processes like Chatterbox.

USAGE:
  python t2_agent.py

Or with custom settings:
  python t2_agent.py --port 5050 --chatterbox-dir "C:\Chatterbox"

The agent exposes these endpoints:
  GET  /status              - Agent health check
  GET  /chatterbox/status   - Check if Chatterbox is running
  POST /chatterbox/start    - Start Chatterbox
  POST /chatterbox/stop     - Stop Chatterbox
"""

import argparse
import http.server
import json
import os
import platform
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

# =============================================================================
# CONFIGURATION - Edit these paths for your system
# =============================================================================

# Default Chatterbox location (Windows)
if platform.system() == 'Windows':
    DEFAULT_CHATTERBOX_DIR = r"C:\Chatterbox"
    DEFAULT_PYTHON = os.path.join(DEFAULT_CHATTERBOX_DIR, "venv", "Scripts", "python.exe")
else:
    DEFAULT_CHATTERBOX_DIR = os.path.expanduser("~/chatterbox")
    DEFAULT_PYTHON = os.path.join(DEFAULT_CHATTERBOX_DIR, "venv", "bin", "python")

DEFAULT_PORT = 5050
CHATTERBOX_PORT = 8100
CHATTERBOX_SCRIPT = "server.py"

# =============================================================================
# GLOBAL STATE
# =============================================================================

chatterbox_process = None
config = {
    'chatterbox_dir': DEFAULT_CHATTERBOX_DIR,
    'chatterbox_python': DEFAULT_PYTHON,
    'chatterbox_port': CHATTERBOX_PORT
}

# =============================================================================
# CHATTERBOX CONTROL FUNCTIONS
# =============================================================================

def is_chatterbox_running():
    """Check if Chatterbox is responding on its port."""
    try:
        req = urllib.request.Request(
            f"http://localhost:{config['chatterbox_port']}/",
            method='GET'
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except:
        return False


def is_port_in_use(port):
    """Check if a port is in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def start_chatterbox():
    """Start the Chatterbox server."""
    global chatterbox_process
    
    if is_chatterbox_running():
        return {'success': True, 'message': 'Chatterbox already running', 'alreadyRunning': True}
    
    script_path = os.path.join(config['chatterbox_dir'], CHATTERBOX_SCRIPT)
    if not os.path.exists(script_path):
        return {
            'success': False, 
            'error': f"Chatterbox script not found at: {script_path}",
            'hint': 'Update CHATTERBOX_DIR in this script or use --chatterbox-dir argument'
        }
    
    python_exe = config['chatterbox_python']
    if not os.path.exists(python_exe):
        python_exe = sys.executable  # Fall back to current Python
        print(f"[Agent] Venv Python not found, using: {python_exe}")
    
    try:
        print(f"[Agent] Starting Chatterbox with: {python_exe}")
        
        # Set environment for proper Unicode handling
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        env['PYTHONUNBUFFERED'] = '1'
        
        # Start the process
        if platform.system() == 'Windows':
            # On Windows, use CREATE_NEW_CONSOLE to give it its own window
            chatterbox_process = subprocess.Popen(
                [python_exe, CHATTERBOX_SCRIPT],
                cwd=config['chatterbox_dir'],
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            chatterbox_process = subprocess.Popen(
                [python_exe, CHATTERBOX_SCRIPT],
                cwd=config['chatterbox_dir'],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        
        # Wait a moment and check if it started
        time.sleep(3)
        
        if is_chatterbox_running():
            return {'success': True, 'message': 'Chatterbox started successfully'}
        else:
            return {
                'success': True,
                'message': 'Chatterbox process started, may still be initializing',
                'note': 'GPU models take 10-30 seconds to load'
            }
            
    except Exception as e:
        return {'success': False, 'error': str(e)}


def stop_chatterbox():
    """Stop the Chatterbox server."""
    global chatterbox_process
    
    killed = False
    
    if chatterbox_process:
        try:
            if platform.system() == 'Windows':
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(chatterbox_process.pid)], 
                             capture_output=True)
            else:
                chatterbox_process.terminate()
            chatterbox_process = None
            killed = True
        except:
            pass
    
    # Also kill any process on the Chatterbox port
    if platform.system() == 'Windows':
        try:
            # Find PID using port
            result = subprocess.run(
                f'netstat -ano | findstr ":{config["chatterbox_port"]}.*LISTEN"',
                shell=True, capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        if pid.isdigit():
                            subprocess.run(['taskkill', '/F', '/T', '/PID', pid], capture_output=True)
                            killed = True
        except:
            pass
    else:
        try:
            subprocess.run(['pkill', '-f', CHATTERBOX_SCRIPT], capture_output=True)
            killed = True
        except:
            pass
    
    time.sleep(1)
    
    if not is_chatterbox_running():
        return {'success': True, 'message': 'Chatterbox stopped'}
    else:
        return {'success': False, 'error': 'Failed to stop Chatterbox'}

# =============================================================================
# HTTP SERVER
# =============================================================================

class AgentHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler for the agent API."""
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[Agent] {args[0]}")
    
    def send_cors_headers(self):
        """Send CORS headers for browser access."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def send_json(self, data, status=200):
        """Send JSON response."""
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests."""
        path = self.path.split('?')[0]
        
        if path == '/status':
            self.send_json({
                'agent': 'T2AutoTron Local Agent (Python)',
                'version': '1.0.0',
                'running': True,
                'platform': platform.system(),
                'chatterboxConfigured': os.path.exists(
                    os.path.join(config['chatterbox_dir'], CHATTERBOX_SCRIPT)
                )
            })
        
        elif path == '/chatterbox/status':
            running = is_chatterbox_running()
            self.send_json({
                'running': running,
                'port': config['chatterbox_port'],
                'processManaged': chatterbox_process is not None
            })
        
        else:
            self.send_json({'error': 'Not found'}, 404)
    
    def do_POST(self):
        """Handle POST requests."""
        path = self.path.split('?')[0]
        
        if path == '/chatterbox/start':
            result = start_chatterbox()
            self.send_json(result)
        
        elif path == '/chatterbox/stop':
            result = stop_chatterbox()
            self.send_json(result)
        
        else:
            self.send_json({'error': 'Not found'}, 404)

# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='T2AutoTron Local Agent - Control local processes from T2 web UI'
    )
    parser.add_argument('--port', type=int, default=DEFAULT_PORT,
                       help=f'Port to run agent on (default: {DEFAULT_PORT})')
    parser.add_argument('--chatterbox-dir', type=str, default=DEFAULT_CHATTERBOX_DIR,
                       help=f'Path to Chatterbox installation (default: {DEFAULT_CHATTERBOX_DIR})')
    
    args = parser.parse_args()
    
    # Update config
    config['chatterbox_dir'] = args.chatterbox_dir
    config['chatterbox_python'] = os.path.join(
        args.chatterbox_dir, 
        "venv", 
        "Scripts" if platform.system() == 'Windows' else "bin",
        "python.exe" if platform.system() == 'Windows' else "python"
    )
    
    # Check if Chatterbox exists
    script_path = os.path.join(config['chatterbox_dir'], CHATTERBOX_SCRIPT)
    if os.path.exists(script_path):
        print(f"[Agent] ✓ Chatterbox found at: {config['chatterbox_dir']}")
    else:
        print(f"[Agent] ⚠ Chatterbox NOT found at: {config['chatterbox_dir']}")
        print(f"[Agent]   Use --chatterbox-dir to specify the correct path")
    
    # Start server
    server = http.server.HTTPServer(('0.0.0.0', args.port), AgentHandler)
    
    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║           T2AutoTron Local Agent (Python)                     ║
╠═══════════════════════════════════════════════════════════════╣
║  Agent running on: http://localhost:{args.port:<5}                    ║
║  Chatterbox dir:   {config['chatterbox_dir'][:40]:<41} ║
║                                                               ║
║  This enables the T2 web UI to control Chatterbox.            ║
║  Keep this window open while using T2.                        ║
║                                                               ║
║  Press Ctrl+C to stop.                                        ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Agent] Shutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()
