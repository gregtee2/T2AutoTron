/**
 * InternetRadioNode.js (Backend Engine)
 * 
 * Server-side implementation for 24/7 headless operation.
 * Plays internet radio streams through Home Assistant media players.
 */

const homeAssistantManager = require('../../devices/managers/homeAssistantManager');

class InternetRadioNode {
    constructor() {
        this.type = 'InternetRadioNode';
        this.properties = {
            stations: [
                { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
                { name: 'SomaFM Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
                { name: 'Jazz24', url: 'https://live.wostreaming.net/direct/ppm-jazz24aac-ibc1' }
            ],
            selectedStation: 0,
            selectedSpeaker: '',
            volume: 50,
            isPlaying: false
        };
        this.inputs = {};
        this.outputs = { playing: false, station: '' };
        
        // Track previous trigger state for edge detection
        this._lastTrigger = undefined;
    }

    async process(inputs) {
        const trigger = inputs.trigger?.[0];
        const stationIndex = inputs.stationIndex?.[0];
        const speakerInput = inputs.speaker?.[0];

        // Handle speaker override
        if (speakerInput && speakerInput !== this.properties.selectedSpeaker) {
            this.properties.selectedSpeaker = speakerInput;
        }

        // Handle station index change
        if (stationIndex !== undefined && stationIndex !== this.properties.selectedStation) {
            const idx = Math.max(0, Math.min(Math.floor(stationIndex), this.properties.stations.length - 1));
            this.properties.selectedStation = idx;
            
            // If playing, switch to new station
            if (this.properties.isPlaying) {
                await this.playStream();
            }
        }

        // Handle trigger input (edge detection)
        if (trigger !== undefined && trigger !== this._lastTrigger) {
            this._lastTrigger = trigger;
            
            if (trigger && !this.properties.isPlaying) {
                await this.playStream();
            } else if (!trigger && this.properties.isPlaying) {
                await this.stopStream();
            }
        }

        // Update outputs
        const currentStation = this.properties.stations[this.properties.selectedStation];
        this.outputs = {
            playing: this.properties.isPlaying,
            station: currentStation?.name || ''
        };

        return this.outputs;
    }

    async playStream() {
        const station = this.properties.stations[this.properties.selectedStation];
        const speaker = this.properties.selectedSpeaker;

        if (!station || !speaker) {
            console.log('[InternetRadio-BE] No station or speaker selected');
            return;
        }

        try {
            // Set volume first
            await homeAssistantManager.callService('media_player', 'volume_set', {
                entity_id: speaker,
                volume_level: this.properties.volume / 100
            });

            // Play the media
            await homeAssistantManager.callService('media_player', 'play_media', {
                entity_id: speaker,
                media_content_id: station.url,
                media_content_type: 'music'
            });

            this.properties.isPlaying = true;
            console.log(`[InternetRadio-BE] ▶️ Playing "${station.name}" on ${speaker}`);
        } catch (err) {
            console.error('[InternetRadio-BE] Play error:', err.message);
        }
    }

    async stopStream() {
        const speaker = this.properties.selectedSpeaker;
        if (!speaker) return;

        try {
            await homeAssistantManager.callService('media_player', 'media_stop', {
                entity_id: speaker
            });

            this.properties.isPlaying = false;
            console.log(`[InternetRadio-BE] ⏹️ Stopped playback on ${speaker}`);
        } catch (err) {
            console.error('[InternetRadio-BE] Stop error:', err.message);
        }
    }

    restore(state) {
        if (state.properties) {
            this.properties = { ...this.properties, ...state.properties };
            this.properties.isPlaying = false; // Don't auto-resume on load
        }
    }

    serialize() {
        return {
            stations: this.properties.stations,
            selectedStation: this.properties.selectedStation,
            selectedSpeaker: this.properties.selectedSpeaker,
            volume: this.properties.volume
        };
    }
}

module.exports = InternetRadioNode;

// Register with backend node registry
module.exports.register = (registry) => {
    registry.register('InternetRadioNode', InternetRadioNode);
};
