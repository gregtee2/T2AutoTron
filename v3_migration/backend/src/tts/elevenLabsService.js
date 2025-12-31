/**
 * ElevenLabs TTS Service
 * 
 * Generates high-quality AI speech using the ElevenLabs API
 * Returns audio files that can be played on HA media_players
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logging/logger');

// Cache for voices list
let voicesCache = null;
let voicesCacheTime = 0;
const VOICES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Audio files directory
const AUDIO_DIR = path.join(__dirname, '../../audio/tts');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Get list of available ElevenLabs voices
 */
async function getVoices() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not configured' };
  }

  // Check cache
  if (voicesCache && (Date.now() - voicesCacheTime) < VOICES_CACHE_TTL) {
    return { success: true, voices: voicesCache };
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.log(`ElevenLabs voices fetch failed: ${response.status} - ${errText}`, 'error');
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    voicesCache = data.voices || [];
    voicesCacheTime = Date.now();

    logger.log(`ElevenLabs: Fetched ${voicesCache.length} voices`, 'info');
    return { success: true, voices: voicesCache };

  } catch (err) {
    logger.log(`ElevenLabs voices error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Generate speech audio from text
 * 
 * @param {string} text - The text to speak
 * @param {object} options - { voiceId, modelId, stability, similarityBoost }
 * @returns {object} { success, audioUrl, filePath, error }
 */
async function generateSpeech(text, options = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ELEVENLABS_API_KEY not configured' };
  }

  // Default to Charlotte if available, otherwise use first available voice
  const voiceId = options.voiceId || 'XB0fDUnXU5powFXDhCwa'; // Charlotte's default ID
  // Use eleven_multilingual_v2 - the v1 models are deprecated on free tier
  const modelId = options.modelId || 'eleven_multilingual_v2';

  try {
    logger.log(`ElevenLabs: Generating speech for "${text.substring(0, 50)}..." with voice ${voiceId}`, 'info');

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.log(`ElevenLabs TTS failed: ${response.status} - ${errText}`, 'error');
      return { success: false, error: `API error: ${response.status}` };
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `tts_${timestamp}.mp3`;
    const filePath = path.join(AUDIO_DIR, filename);

    // Write to file
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    logger.log(`ElevenLabs: Audio saved to ${filename}`, 'info');

    // Return the relative URL path (will be served by express static)
    return {
      success: true,
      filePath,
      filename,
      audioUrl: `/audio/tts/${filename}`
    };

  } catch (err) {
    logger.log(`ElevenLabs TTS error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Clean up old audio files (older than 1 hour)
 */
function cleanupOldAudio() {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();

  try {
    const files = fs.readdirSync(AUDIO_DIR);
    let cleaned = 0;

    for (const file of files) {
      if (!file.startsWith('tts_')) continue;
      
      const filePath = path.join(AUDIO_DIR, file);
      const stat = fs.statSync(filePath);
      
      if (now - stat.mtimeMs > ONE_HOUR) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.log(`ElevenLabs: Cleaned up ${cleaned} old audio files`, 'info');
    }
  } catch (err) {
    logger.log(`ElevenLabs cleanup error: ${err.message}`, 'warn');
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldAudio, 30 * 60 * 1000);

module.exports = {
  getVoices,
  generateSpeech,
  cleanupOldAudio,
  AUDIO_DIR
};
