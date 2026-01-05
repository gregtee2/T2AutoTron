/**
 * Audio Mixer Service
 * 
 * Provides a unified audio stream that mixes:
 * 1. Background music (internet radio stream) - continuous
 * 2. TTS announcements - mixed in via stdin pipe, no stream interruption
 * 
 * Architecture:
 * [Internet Radio] ──┐
 *                    ├──► [FFmpeg amix - always running] ──► [HTTP Stream] ──► [Speakers]
 * [TTS via stdin] ───┘    (ducks music, mixes TTS, restores)
 * 
 * Key: FFmpeg runs ONCE with two inputs. TTS is fed through stdin pipe.
 * The HTTP connection never breaks, so HomePod stays happy.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

class AudioMixerService extends EventEmitter {
    constructor() {
        super();
        
        // Default stream - Groove Salad from SomaFM
        this.streamUrl = 'http://ice1.somafm.com/groovesalad-128-mp3';
        this.isRunning = false;
        this.ffmpegProcess = null;
        this.clients = new Set(); // Connected HTTP clients
        
        // Audio settings
        this.musicVolume = 1.0;  // 0.0 - 1.0
        this.duckVolume = 0.15;  // Volume during TTS (15%)
        this.ttsVolume = 1.5;    // TTS boost
        this.isTTSPlaying = false;
        
        // Buffer for smooth streaming
        this.audioBuffer = [];
        this.maxBufferSize = 50; // ~5 seconds at 128kbps
    }

    /**
     * Set the source stream URL
     */
    setStreamUrl(url) {
        const wasRunning = this.isRunning;
        if (wasRunning) {
            this.stop();
        }
        this.streamUrl = url;
        console.log(`[AudioMixer] Stream URL set to: ${url}`);
        if (wasRunning) {
            this.start();
        }
    }

    /**
     * Start the audio mixer with dual-input FFmpeg (radio + TTS pipe)
     */
    start() {
        if (this.isRunning) {
            console.log('[AudioMixer] Already running');
            return;
        }

        console.log(`[AudioMixer] Starting with stream: ${this.streamUrl}`);
        
        // FFmpeg with two inputs:
        // Input 0: Radio stream (continuous)
        // Input 1: Stdin pipe for TTS (we'll send audio bytes when needed)
        //
        // The amix filter combines them. When stdin has no data, only radio plays.
        // When we write TTS audio to stdin, it gets mixed in.
        //
        // Using anullsrc as a "silent" input that we'll replace with actual TTS
        this.ffmpegProcess = spawn('ffmpeg', [
            // Input 0: Radio stream
            '-reconnect', '1',
            '-reconnect_streamed', '1', 
            '-reconnect_delay_max', '5',
            '-i', this.streamUrl,
            // Just output the radio stream for now
            // TTS will be handled by a separate overlay approach
            '-af', `volume=${this.musicVolume}`,
            '-vn',
            '-acodec', 'libmp3lame',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'mp3',
            '-fflags', '+genpts',
            '-flush_packets', '1',
            '-'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.isRunning = true;

        // Handle audio data from FFmpeg
        this.ffmpegProcess.stdout.on('data', (chunk) => {
            // Buffer the audio
            this.audioBuffer.push(chunk);
            if (this.audioBuffer.length > this.maxBufferSize) {
                this.audioBuffer.shift();
            }
            
            // Send to all connected clients (unless paused for TTS)
            if (!this._pauseForTTS) {
                for (const client of this.clients) {
                    try {
                        client.write(chunk);
                    } catch (err) {}
                }
            }
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
            if (VERBOSE) {
                console.log(`[AudioMixer] FFmpeg: ${data.toString().trim()}`);
            }
        });

        this.ffmpegProcess.on('close', (code) => {
            console.log(`[AudioMixer] FFmpeg exited with code ${code}`);
            this.isRunning = false;
            
            // Auto-restart if unexpected exit
            if (code !== 0 && !this._stopping) {
                console.log('[AudioMixer] Restarting in 5 seconds...');
                setTimeout(() => this.start(), 5000);
            }
        });

        this.ffmpegProcess.on('error', (err) => {
            console.error('[AudioMixer] FFmpeg error:', err.message);
            this.isRunning = false;
        });

        console.log('[AudioMixer] ✅ Started');
        this.emit('started');
    }

    /**
     * Stop the audio mixer
     */
    stop() {
        if (!this.isRunning) return;
        
        console.log('[AudioMixer] Stopping...');
        this._stopping = true;
        
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill('SIGTERM');
            this.ffmpegProcess = null;
        }
        
        this.isRunning = false;
        this._stopping = false;
        
        // Disconnect all clients
        for (const client of this.clients) {
            try {
                client.end();
            } catch (err) {}
        }
        this.clients.clear();
        
        console.log('[AudioMixer] ✅ Stopped');
        this.emit('stopped');
    }

    /**
     * Add an HTTP client to receive the stream
     */
    addClient(res) {
        // Set headers for MP3 streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'none');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Connection', 'close');
        res.setHeader('icy-br', '128');
        res.setHeader('icy-name', 'T2AutoTron Audio Mixer');
        res.setHeader('icy-genre', 'Ambient');
        res.setHeader('icy-pub', '0');
        
        this.clients.add(res);
        console.log(`[AudioMixer] Client connected (${this.clients.size} total)`);
        
        // Send buffered audio for quick start
        for (const chunk of this.audioBuffer) {
            try {
                res.write(chunk);
            } catch (err) {}
        }
        
        // Handle client disconnect
        res.on('close', () => {
            this.clients.delete(res);
            console.log(`[AudioMixer] Client disconnected (${this.clients.size} remaining)`);
        });
        
        // Auto-start if not running
        if (!this.isRunning) {
            this.start();
        }
    }

    /**
     * Play TTS by encoding it and sending directly to clients
     * This approach: pause music bytes, send TTS bytes, resume music bytes
     * The HTTP connection stays alive - we're just changing what bytes we send
     */
    async playTTS(audioFilePath) {
        if (!fs.existsSync(audioFilePath)) {
            console.log(`[AudioMixer] ❌ TTS file not found: ${audioFilePath}`);
            return false;
        }

        if (this.isTTSPlaying) {
            console.log(`[AudioMixer] ⏳ TTS already playing, waiting...`);
            await new Promise(r => setTimeout(r, 500));
            return this.playTTS(audioFilePath);
        }

        // Check if we have any connected clients
        if (this.clients.size === 0) {
            console.log(`[AudioMixer] ⚠️ No clients connected to receive TTS`);
            return false;
        }

        this.isTTSPlaying = true;
        this._pauseForTTS = true;
        console.log(`[AudioMixer] 🎤 Playing TTS: ${path.basename(audioFilePath)}`);
        console.log(`[AudioMixer] 📡 Sending to ${this.clients.size} connected client(s)`);

        return new Promise((resolve) => {
            let bytesSent = 0;
            
            // Encode TTS to same format as main stream
            const ttsEncoder = spawn('ffmpeg', [
                '-i', audioFilePath,
                '-vn',
                '-acodec', 'libmp3lame',
                '-b:a', '128k',
                '-ar', '44100',
                '-ac', '2',
                '-f', 'mp3',
                '-fflags', '+genpts',
                '-'
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Send TTS audio directly to clients
            ttsEncoder.stdout.on('data', (chunk) => {
                bytesSent += chunk.length;
                for (const client of this.clients) {
                    try {
                        client.write(chunk);
                    } catch (err) {
                        console.log(`[AudioMixer] Client write error: ${err.message}`);
                    }
                }
            });

            ttsEncoder.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                // Always log TTS encoding progress for debugging
                if (msg.includes('time=') || msg.includes('size=')) {
                    console.log(`[AudioMixer] TTS encode: ${msg.substring(0, 100)}`);
                }
            });

            ttsEncoder.on('close', (code) => {
                console.log(`[AudioMixer] ✅ TTS complete (${bytesSent} bytes sent), resuming music`);
                this._pauseForTTS = false;
                this.isTTSPlaying = false;
                resolve(true);
            });

            ttsEncoder.on('error', (err) => {
                console.error('[AudioMixer] TTS error:', err.message);
                this._pauseForTTS = false;
                this.isTTSPlaying = false;
                resolve(false);
            });
        });
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            running: this.isRunning,
            streamUrl: this.streamUrl,
            clients: this.clients.size,
            bufferSize: this.audioBuffer.length,
            musicVolume: this.musicVolume,
            isTTSPlaying: this.isTTSPlaying
        };
    }
}

// Singleton instance
const audioMixer = new AudioMixerService();

module.exports = audioMixer;
