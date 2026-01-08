# T2 Local Agent for Addon Users

If you're running T2AutoTron as a **Home Assistant Addon** (on a Pi or server) but have **Chatterbox TTS running on your local desktop** with a GPU, this agent bridges the gap.

## How It Works

```
┌─────────────────────────┐          ┌─────────────────────────┐
│  Raspberry Pi / Server  │          │  Your Desktop           │
│                         │          │                         │
│  T2 Addon               │          │  Chatterbox (GPU TTS)   │
│  (web UI on port 3000)  │◄────────►│  (port 8100)            │
│                         │  Browser │                         │
└─────────────────────────┘          │  Local Agent            │
                                     │  (port 5050)            │
                                     └─────────────────────────┘
```

When you open the T2 web UI in your browser, JavaScript runs **on your desktop**. The Chatterbox Panel in T2 calls `localhost:5050` which reaches this agent running on your desktop. The agent then controls Chatterbox.

## Quick Start (Windows)

1. **Download these 2 files** to your desktop (anywhere):
   - `t2_agent.py`
   - `start_agent.bat`

2. **Edit `t2_agent.py`** (optional) - Update the path if Chatterbox isn't in `C:\Chatterbox`:
   ```python
   DEFAULT_CHATTERBOX_DIR = r"C:\Chatterbox"  # Change this if needed
   ```

3. **Double-click `start_agent.bat`** to start the agent

4. **Open T2 in your browser** - You'll see a "🗣️ Chatterbox TTS" panel in the Control Panel

5. **Click Start** to launch Chatterbox from the web UI!

## Quick Start (Linux/Mac)

```bash
# Run the agent
python3 t2_agent.py

# Or with custom Chatterbox path:
python3 t2_agent.py --chatterbox-dir /path/to/chatterbox
```

## Command Line Options

```
--port              Agent port (default: 5050)
--chatterbox-dir    Path to Chatterbox installation
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Agent health check |
| `/chatterbox/status` | GET | Check if Chatterbox is running |
| `/chatterbox/start` | POST | Start Chatterbox |
| `/chatterbox/stop` | POST | Stop Chatterbox |

## Troubleshooting

**Chatterbox panel doesn't appear in T2:**
- Make sure the agent is running on your desktop
- Check that port 5050 isn't blocked by firewall
- The panel auto-hides if the agent isn't reachable

**"Chatterbox not found" error:**
- Edit the script to set the correct `CHATTERBOX_DIR`
- Or use: `python t2_agent.py --chatterbox-dir "D:\MyChatterbox"`

**Chatterbox starts but shows errors:**
- Check the Chatterbox window for error messages
- Make sure GPU drivers are installed
- Verify Chatterbox works when started manually first
