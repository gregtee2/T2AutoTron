/**
 * Audio Mixer API Routes
 * 
 * Provides endpoints for the unified audio stream.
 * 
 * GET  /api/audio/stream     - The actual MP3 stream (point speakers here)
 * GET  /api/audio/status     - Mixer status
 * POST /api/audio/start      - Start the mixer
 * POST /api/audio/stop       - Stop the mixer  
 * POST /api/audio/set-source - Change the source stream URL
 * POST /api/audio/tts        - Play TTS through the mixer
 */

const express = require('express');
const router = express.Router();
const audioMixer = require('../../services/audioMixerService');

/**
 * GET /api/audio/stream
 * The actual audio stream - point speakers to this URL
 */
router.get('/stream', (req, res) => {
    console.log('[AudioMixer API] New stream client connecting...');
    audioMixer.addClient(res);
});

/**
 * GET /api/audio/test
 * Test page with audio player - use this to verify the stream works
 */
router.get('/test', (req, res) => {
    const host = req.get('host');
    const streamUrl = `http://${host}/api/audio/stream`;
    
    // Bypass CSP for this test page
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html');
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>T2 Audio Mixer Test</title>
    <style>
        body { font-family: sans-serif; background: #1a1a2e; color: #eee; padding: 40px; }
        h1 { color: #00ff88; }
        audio { width: 100%; margin: 20px 0; }
        .status { padding: 10px; background: #333; border-radius: 4px; margin: 10px 0; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; background: #00d9ff; border: none; border-radius: 4px; }
        button:hover { background: #00b8d9; }
        #log { background: #111; padding: 10px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <h1>🎛️ T2 Audio Mixer Test</h1>
    <div class="status">Stream URL: <code>${streamUrl}</code></div>
    
    <h3>Audio Player:</h3>
    <audio id="player" controls>
        <source src="${streamUrl}" type="audio/mpeg">
    </audio>
    
    <div>
        <button id="btnPlay">▶️ Play</button>
        <button id="btnPause">⏸️ Pause</button>
        <button id="btnStatus">📊 Status</button>
    </div>
    
    <h3>Log:</h3>
    <div id="log"></div>
    
    <script>
        function log(msg) {
            var el = document.getElementById('log');
            el.innerHTML += new Date().toLocaleTimeString() + ': ' + msg + '<br>';
            el.scrollTop = el.scrollHeight;
        }
        
        async function checkStatus() {
            try {
                var res = await fetch('/api/audio/status');
                var data = await res.json();
                log('Status: ' + JSON.stringify(data));
            } catch(e) {
                log('Error: ' + e.message);
            }
        }
        
        var player = document.getElementById('player');
        
        document.getElementById('btnPlay').addEventListener('click', function() {
            player.play();
        });
        
        document.getElementById('btnPause').addEventListener('click', function() {
            player.pause();
        });
        
        document.getElementById('btnStatus').addEventListener('click', checkStatus);
        
        player.addEventListener('play', function() { log('Player started'); });
        player.addEventListener('pause', function() { log('Player paused'); });
        player.addEventListener('error', function(e) { log('Player error: ' + player.error.message); });
        player.addEventListener('loadstart', function() { log('Loading stream...'); });
        player.addEventListener('canplay', function() { log('Stream ready to play!'); });
        
        // Auto-check status
        checkStatus();
    </script>
</body>
</html>
    `);
});

/**
 * GET /api/audio/status
 * Get mixer status
 */
router.get('/status', (req, res) => {
    res.json(audioMixer.getStatus());
});

/**
 * POST /api/audio/start
 * Start the audio mixer
 */
router.post('/start', (req, res) => {
    audioMixer.start();
    res.json({ success: true, message: 'Audio mixer started' });
});

/**
 * POST /api/audio/stop
 * Stop the audio mixer
 */
router.post('/stop', (req, res) => {
    audioMixer.stop();
    res.json({ success: true, message: 'Audio mixer stopped' });
});

/**
 * POST /api/audio/set-source
 * Change the source stream URL
 * Body: { url: "http://..." }
 */
router.post('/set-source', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    audioMixer.setStreamUrl(url);
    res.json({ success: true, streamUrl: url });
});

/**
 * POST /api/audio/tts
 * Play TTS through the mixer
 * Body: { audioFile: "/path/to/tts.wav" }
 */
router.post('/tts', async (req, res) => {
    const { audioFile } = req.body;
    if (!audioFile) {
        return res.status(400).json({ error: 'Missing audioFile parameter' });
    }
    
    try {
        const success = await audioMixer.playTTS(audioFile);
        res.json({ success, message: success ? 'TTS played' : 'TTS playback failed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
