/**
 * Chatterbox TTS Service
 * 
 * Local text-to-speech using Chatterbox (Resemble AI)
 * Generates high-quality AI speech locally on GPU
 * Supports voice cloning with reference audio files
 * 
 * Server must be running at CHATTERBOX_URL (default: http://localhost:8100)
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logging/logger');

// Cache for voices list
let voicesCache = null;
let voicesCacheTime = 0;
const VOICES_CACHE_TTL = 30 * 1000; // 30 seconds (voices are local files, cache short)

// Audio files directory (shared with ElevenLabs)
const AUDIO_DIR = path.join(__dirname, '../../audio/tts');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Max age for TTS files before cleanup (30 seconds)
const TTS_FILE_MAX_AGE_MS = 30 * 1000;

/**
 * Clean up old TTS audio files to prevent accumulation
 * Called automatically after generating new audio
 */
function cleanupOldTTSFiles() {
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.startsWith('tts_cb_')) continue; // Only clean Chatterbox files
      
      const filePath = path.join(AUDIO_DIR, file);
      const stats = fs.statSync(filePath);
      const ageMs = now - stats.mtimeMs;
      
      if (ageMs > TTS_FILE_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      logger.log(`Chatterbox: Cleaned up ${deletedCount} old TTS files`, 'info');
    }
  } catch (err) {
    logger.log(`Chatterbox: Cleanup error: ${err.message}`, 'warn');
  }
}

// Chatterbox server URL
const getChatterboxUrl = () => process.env.CHATTERBOX_URL || 'http://localhost:8100';

/**
 * Check if Chatterbox server is running
 */
async function isAvailable() {
  try {
    const response = await fetch(`${getChatterboxUrl()}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    if (response.ok) {
      const data = await response.json();
      return { 
        available: true, 
        model: data.model,
        cuda: data.cuda,
        gpu: data.gpu
      };
    }
    return { available: false, error: 'Server not responding' };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Get list of available Chatterbox voices (reference audio files)
 */
async function getVoices() {
  // Check cache
  if (voicesCache && (Date.now() - voicesCacheTime) < VOICES_CACHE_TTL) {
    return { success: true, voices: voicesCache };
  }

  try {
    const response = await fetch(`${getChatterboxUrl()}/voices`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.log(`Chatterbox voices fetch failed: ${response.status} - ${errText}`, 'error');
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Transform to ElevenLabs-like format for UI compatibility
    // Chatterbox returns { voices: ['file1.wav', 'file2.wav'], default: 'file.wav' }
    const voices = (data.voices || []).map((filename, index) => ({
      voice_id: filename,
      name: filename.replace(/\.(wav|mp3)$/i, '').replace(/_/g, ' '),
      category: 'cloned',
      labels: { source: 'local' }
    }));
    
    // Add default voice option
    voices.unshift({
      voice_id: '',
      name: 'Default (Built-in)',
      category: 'default',
      labels: { source: 'builtin' }
    });

    voicesCache = voices;
    voicesCacheTime = Date.now();

    logger.log(`Chatterbox: Found ${voices.length - 1} custom voices`, 'info');
    return { success: true, voices };

  } catch (err) {
    // If server is down, return empty list with default
    if (err.name === 'TimeoutError' || err.message.includes('ECONNREFUSED')) {
      logger.log('Chatterbox server not available', 'warn');
      return { 
        success: true, 
        voices: [{
          voice_id: '',
          name: 'Default (Built-in)',
          category: 'default',
          labels: { source: 'builtin' }
        }],
        warning: 'Chatterbox server not running'
      };
    }
    logger.log(`Chatterbox voices error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Generate speech audio from text
 * 
 * @param {string} text - The text to speak
 * @param {object} options - { voiceId (filename), exaggeration, cfg_weight }
 * @returns {object} { success, audioUrl, filePath, error }
 */
async function generateSpeech(text, options = {}) {
  try {
    const voiceId = options.voiceId || ''; // Empty = use default built-in voice
    
    logger.log(`Chatterbox: Generating speech for "${text.substring(0, 50)}..."${voiceId ? ` with voice ${voiceId}` : ''}`, 'info');

    const requestBody = {
      text,
      voice: voiceId || undefined,
      exaggeration: options.exaggeration,
      cfg_weight: options.cfg_weight
    };

    const response = await fetch(`${getChatterboxUrl()}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000) // 60 second timeout for generation
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.log(`Chatterbox TTS failed: ${response.status} - ${errText}`, 'error');
      return { success: false, error: `API error: ${response.status}` };
    }

    // Get audio buffer (WAV format)
    const audioBuffer = await response.arrayBuffer();

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `tts_cb_${timestamp}.wav`;
    const filePath = path.join(AUDIO_DIR, filename);

    // Write to file
    const audioData = Buffer.from(audioBuffer);
    fs.writeFileSync(filePath, audioData);

    // Calculate duration from WAV file (sample rate is in bytes 24-27, data size after headers)
    // WAV format: first 44 bytes are header, then audio data
    let durationMs = 5000; // Default fallback
    try {
      if (audioData.length > 44) {
        const sampleRate = audioData.readUInt32LE(24); // bytes 24-27
        const bitsPerSample = audioData.readUInt16LE(34); // bytes 34-35
        const numChannels = audioData.readUInt16LE(22); // bytes 22-23
        const dataSize = audioData.length - 44; // Audio data after header
        const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
        durationMs = Math.round((dataSize / bytesPerSecond) * 1000);
        logger.log(`Chatterbox: Audio duration ${durationMs}ms (${sampleRate}Hz, ${bitsPerSample}bit, ${numChannels}ch)`, 'info');
      }
    } catch (parseErr) {
      logger.log(`Chatterbox: Could not parse WAV duration: ${parseErr.message}`, 'warn');
    }

    logger.log(`Chatterbox: Audio saved to ${filename}`, 'info');

    // Clean up old TTS files to prevent accumulation
    cleanupOldTTSFiles();

    // Return the relative URL path (will be served by express static)
    return {
      success: true,
      filePath,
      filename,
      audioUrl: `/audio/tts/${filename}`,
      durationMs
    };

  } catch (err) {
    if (err.name === 'TimeoutError') {
      logger.log('Chatterbox TTS timed out (generation took too long)', 'error');
      return { success: false, error: 'Generation timed out' };
    }
    if (err.message.includes('ECONNREFUSED')) {
      logger.log('Chatterbox server not running', 'error');
      return { success: false, error: 'Chatterbox server not running. Start it with: python C:\\Chatterbox\\server.py' };
    }
    logger.log(`Chatterbox TTS error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Upload a voice reference file for cloning
 * 
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {string} name - Name for the voice (will be used as filename)
 * @returns {object} { success, voiceId, error }
 */
async function uploadVoice(audioBuffer, name) {
  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    // Ensure name has extension
    const filename = name.endsWith('.wav') || name.endsWith('.mp3') ? name : `${name}.wav`;
    
    formData.append('file', audioBuffer, { filename });
    formData.append('name', filename);

    const response = await fetch(`${getChatterboxUrl()}/upload-voice`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.log(`Chatterbox voice upload failed: ${response.status} - ${errText}`, 'error');
      return { success: false, error: `Upload failed: ${response.status}` };
    }

    const data = await response.json();
    
    // Clear cache so new voice appears
    voicesCache = null;
    
    logger.log(`Chatterbox: Voice "${filename}" uploaded successfully`, 'info');
    return { success: true, voiceId: filename };

  } catch (err) {
    logger.log(`Chatterbox voice upload error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

module.exports = {
  isAvailable,
  getVoices,
  generateSpeech,
  uploadVoice
};
