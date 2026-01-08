#!/usr/bin/env python3
"""
T2AutoTron Local Agent
======================
This agent runs on your desktop and allows T2AutoTron (even on a remote 
Raspberry Pi) to control local apps like Chatterbox TTS.

FIRST RUN: A setup wizard will guide you through configuration.
AFTER SETUP: Just double-click to start the agent!
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
# CONFIGURATION
# =============================================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "t2_agent_config.json")
DEFAULT_PORT = 5050
CHATTERBOX_PORT = 8100

# Scripts we look for to identify a Chatterbox installation
CHATTERBOX_SCRIPTS = ["server.py", "run_api_server.py", "app.py"]

# Global state
chatterbox_process = None
config = {}

# =============================================================================
# SETUP WIZARD
# =============================================================================

def clear_screen():
    """Clear the console screen."""
    os.system('cls' if platform.system() == 'Windows' else 'clear')

def show_welcome_banner():
    """Show a friendly welcome message."""
    clear_screen()
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 58 + "║")
    print("║   🤖 T2AutoTron Local Agent - First Time Setup          ║")
    print("║" + " " * 58 + "║")
    print("╠" + "═" * 58 + "╣")
    print("║                                                          ║")
    print("║   This agent allows T2AutoTron to control Chatterbox    ║")
    print("║   TTS on your local computer.                           ║")
    print("║                                                          ║")
    print("║   We need to know where Chatterbox is installed.        ║")
    print("║                                                          ║")
    print("╚" + "═" * 58 + "╝")
    print()

def try_gui_folder_picker(title="Select your Chatterbox folder"):
    """Try to open a GUI folder picker. Returns path or None."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        root.update()
        
        folder = filedialog.askdirectory(
            title=title,
            mustexist=True
        )
        
        root.destroy()
        return folder if folder else None
    except Exception as e:
        return None

def find_chatterbox_auto():
    """Try to auto-detect Chatterbox installation."""
    username = os.environ.get('USERNAME', os.environ.get('USER', ''))
    
    common_locations = [
        # Windows common paths
        r"C:\Chatterbox",
        r"C:\chatterbox", 
        r"C:\chatterbox-master",
        r"C:\Chatterbox-TTS",
        rf"C:\Users\{username}\Chatterbox",
        rf"C:\Users\{username}\chatterbox",
        rf"C:\Users\{username}\Documents\Chatterbox",
        rf"C:\Users\{username}\Desktop\Chatterbox",
        r"C:\AI\Chatterbox",
        r"D:\Chatterbox",
        # Linux/Mac common paths
        os.path.expanduser("~/Chatterbox"),
        os.path.expanduser("~/chatterbox"),
        os.path.expanduser("~/chatterbox-master"),
    ]
    
    for loc in common_locations:
        if os.path.isdir(loc):
            for script in CHATTERBOX_SCRIPTS:
                if os.path.exists(os.path.join(loc, script)):
                    return loc, script
    
    return None, None

def validate_chatterbox_dir(path):
    """Check if a directory contains Chatterbox. Returns (valid, script_name)."""
    if not path or not os.path.isdir(path):
        return False, "Directory does not exist"
    
    for script in CHATTERBOX_SCRIPTS:
        script_path = os.path.join(path, script)
        if os.path.exists(script_path):
            return True, script
    
    return False, f"Could not find Chatterbox scripts in this folder"

def find_python_in_dir(chatterbox_dir):
    """Find Python executable for Chatterbox (prefer venv)."""
    if platform.system() == 'Windows':
        candidates = [
            os.path.join(chatterbox_dir, "venv", "Scripts", "python.exe"),
            os.path.join(chatterbox_dir, ".venv", "Scripts", "python.exe"),
            os.path.join(chatterbox_dir, "env", "Scripts", "python.exe"),
        ]
    else:
        candidates = [
            os.path.join(chatterbox_dir, "venv", "bin", "python"),
            os.path.join(chatterbox_dir, ".venv", "bin", "python"),
            os.path.join(chatterbox_dir, "env", "bin", "python"),
        ]
    
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    
    return sys.executable

def run_setup_wizard():
    """Interactive setup wizard for first-time configuration."""
    show_welcome_banner()
    
    # Step 1: Try auto-detection
    print("  🔍 Looking for Chatterbox installation...")
    print()
    auto_path, auto_script = find_chatterbox_auto()
    
    chatterbox_dir = None
    chatterbox_script = None
    
    if auto_path:
        print(f"  ✅ Found Chatterbox at:")
        print(f"     {auto_path}")
        print()
        response = input("  Use this location? [Y/n]: ").strip().lower()
        if response in ['', 'y', 'yes']:
            chatterbox_dir = auto_path
            chatterbox_script = auto_script
    else:
        print("  ❌ Could not auto-detect Chatterbox.")
    
    # Step 2: If not auto-detected, ask user
    if not chatterbox_dir:
        print()
        print("  📁 Please select your Chatterbox folder...")
        print("     (The folder containing server.py)")
        print()
        
        # Try GUI picker first
        input("  Press Enter to open folder picker...")
        gui_path = try_gui_folder_picker()
        
        if gui_path:
            chatterbox_dir = gui_path
        else:
            # Fall back to manual entry
            print()
            print("  GUI picker not available. Please type the path:")
            print()
            chatterbox_dir = input("  Path: ").strip().strip('"').strip("'")
    
    # Step 3: Validate
    if not chatterbox_dir:
        print()
        print("  ❌ No folder selected.")
        print()
        input("  Press Enter to exit and try again...")
        sys.exit(1)
    
    valid, result = validate_chatterbox_dir(chatterbox_dir)
    
    if not valid:
        print()
        print(f"  ❌ {result}")
        print(f"     Path: {chatterbox_dir}")
        print()
        print("  Make sure you select the folder containing 'server.py'")
        print()
        input("  Press Enter to exit and try again...")
        sys.exit(1)
    
    chatterbox_script = result
    
    # Step 4: Find Python
    python_exe = find_python_in_dir(chatterbox_dir)
    
    # Step 5: Save configuration
    new_config = {
        'chatterbox_dir': chatterbox_dir,
        'chatterbox_python': python_exe,
        'chatterbox_script': chatterbox_script,
        'chatterbox_port': CHATTERBOX_PORT,
        'agent_port': DEFAULT_PORT,
        'setup_complete': True
    }
    
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(new_config, f, indent=2)
    except Exception as e:
        print(f"\n  ⚠️ Could not save config: {e}")
    
    # Show summary
    print()
    print("  " + "─" * 56)
    print(f"  ✅ Setup Complete!")
    print("  " + "─" * 56)
    print(f"  📂 Chatterbox: {chatterbox_dir}")
    print(f"  📜 Script:     {chatterbox_script}")
    print(f"  🐍 Python:     {python_exe}")
    print("  " + "─" * 56)
    print()
    print("  The agent will now start. Next time you run this,")
    print("  it will skip setup and start immediately!")
    print()
    input("  Press Enter to continue...")
    
    return new_config

def load_or_setup_config():
    """Load existing config or run setup wizard."""
    global config
    
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
            
            if config.get('setup_complete') and config.get('chatterbox_dir'):
                valid, _ = validate_chatterbox_dir(config['chatterbox_dir'])
                if valid:
                    return config
                else:
                    print("⚠️ Saved Chatterbox folder is no longer valid.")
                    print("   Running setup again...")
                    print()
        except Exception as e:
            pass
    
    config = run_setup_wizard()
    return config

# =============================================================================
# CHATTERBOX CONTROL
# =============================================================================

def is_chatterbox_running():
    """Check if Chatterbox is responding on its port."""
    port = config.get('chatterbox_port', CHATTERBOX_PORT)
    try:
        req = urllib.request.Request(f"http://localhost:{port}/", method='GET')
        with urllib.request.urlopen(req, timeout=2) as resp:
            return True
    except:
        pass
    return is_port_in_use(port)

def is_port_in_use(port):
    """Check if a port is in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def start_chatterbox():
    """Start the Chatterbox server."""
    global chatterbox_process
    
    if is_chatterbox_running():
        return {'success': True, 'message': 'Already running', 'alreadyRunning': True}
    
    chatterbox_dir = config.get('chatterbox_dir', '')
    script_name = config.get('chatterbox_script', 'server.py')
    script_path = os.path.join(chatterbox_dir, script_name)
    
    if not os.path.exists(script_path):
        return {
            'success': False, 
            'error': f"Script not found: {script_path}",
            'hint': 'Delete t2_agent_config.json to reconfigure'
        }
    
    python_exe = config.get('chatterbox_python', sys.executable)
    if not os.path.exists(python_exe):
        python_exe = sys.executable
    
    try:
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        env['PYTHONUNBUFFERED'] = '1'
        
        if platform.system() == 'Windows':
            chatterbox_process = subprocess.Popen(
                [python_exe, script_name],
                cwd=chatterbox_dir,
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            chatterbox_process = subprocess.Popen(
                [python_exe, script_name],
                cwd=chatterbox_dir,
                env=env,
                start_new_session=True
            )
        
        print(f"🚀 Started Chatterbox (PID: {chatterbox_process.pid})")
        time.sleep(2)
        
        return {
            'success': True, 
            'message': 'Chatterbox started',
            'pid': chatterbox_process.pid
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def stop_chatterbox():
    """Stop the Chatterbox server."""
    global chatterbox_process
    port = config.get('chatterbox_port', CHATTERBOX_PORT)
    
    # Stop managed process
    if chatterbox_process:
        try:
            if platform.system() == 'Windows':
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(chatterbox_process.pid)],
                             capture_output=True)
            else:
                chatterbox_process.terminate()
            chatterbox_process = None
            print("🛑 Stopped Chatterbox")
        except:
            pass
    
    # Also kill any process on the port
    if platform.system() == 'Windows':
        try:
            result = subprocess.run(
                f'netstat -ano | findstr ":{port}.*LISTEN"',
                shell=True, capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        if pid.isdigit():
                            subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
        except:
            pass
    
    time.sleep(1)
    
    if not is_chatterbox_running():
        return {'success': True, 'message': 'Stopped'}
    else:
        return {'success': False, 'error': 'Failed to stop'}

# =============================================================================
# HTTP SERVER
# =============================================================================

class AgentHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler for the agent API."""
    
    def log_message(self, format, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        path = self.path.split('?')[0]
        
        if path in ['/', '/status']:
            self.send_json({
                'agent': 'T2AutoTron Local Agent',
                'version': '1.1.0',
                'running': True
            })
        
        elif path == '/chatterbox/status':
            self.send_json({
                'running': is_chatterbox_running(),
                'port': config.get('chatterbox_port', CHATTERBOX_PORT),
                'processManaged': chatterbox_process is not None
            })
        
        else:
            self.send_json({'error': 'Not found'}, 404)
    
    def do_POST(self):
        path = self.path.split('?')[0]
        
        if path == '/chatterbox/start':
            self.send_json(start_chatterbox())
        elif path == '/chatterbox/stop':
            self.send_json(stop_chatterbox())
        else:
            self.send_json({'error': 'Not found'}, 404)

# =============================================================================
# MAIN
# =============================================================================

def show_running_banner(port):
    """Show the running status banner."""
    clear_screen()
    chatterbox_dir = config.get('chatterbox_dir', 'Not configured')
    
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 58 + "║")
    print("║   🤖 T2AutoTron Local Agent is RUNNING                  ║")
    print("║" + " " * 58 + "║")
    print("╠" + "═" * 58 + "╣")
    print("║                                                          ║")
    print(f"║   📡 Agent URL:    http://localhost:{port:<5}                ║")
    print("║                                                          ║")
    
    # Truncate path if too long
    if len(chatterbox_dir) > 45:
        display_path = "..." + chatterbox_dir[-42:]
    else:
        display_path = chatterbox_dir
    print(f"║   📂 Chatterbox:   {display_path:<38}║")
    print("║                                                          ║")
    print("╠" + "═" * 58 + "╣")
    print("║                                                          ║")
    print("║   ✅ T2AutoTron can now control Chatterbox!              ║")
    print("║                                                          ║")
    print("║   Keep this window open while using T2.                  ║")
    print("║   Press Ctrl+C to stop the agent.                        ║")
    print("║                                                          ║")
    print("╚" + "═" * 58 + "╝")
    print()
    print("  Waiting for commands...")
    print()

def main():
    parser = argparse.ArgumentParser(description='T2AutoTron Local Agent')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--reconfigure', action='store_true', 
                       help='Re-run setup wizard')
    args = parser.parse_args()
    
    # Delete config if reconfiguring
    if args.reconfigure and os.path.exists(CONFIG_FILE):
        os.remove(CONFIG_FILE)
    
    # Load or run setup
    load_or_setup_config()
    
    # Start server
    port = args.port or config.get('agent_port', DEFAULT_PORT)
    show_running_banner(port)
    
    server = http.server.HTTPServer(('0.0.0.0', port), AgentHandler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Agent stopped.")
        server.shutdown()

if __name__ == '__main__':
    main()
