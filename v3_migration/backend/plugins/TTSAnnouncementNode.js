/**
 * TTSAnnouncementNode.js (Audio Output Node)
 * 
 * Combined TTS announcements + background streaming (Internet Radio) in one node.
 * 
 * 🦴 CAVEMAN VERSION:
 * This is your smart speaker's brain. It can:
 * 1. Play background music (internet radio streams)
 * 2. Make TTS announcements that interrupt the music
 * 3. Resume the music after announcements finish
 * 
 * Think of it like a DJ booth - music plays, then the DJ talks, then music continues.
 * 
 * Inputs:
 *   - trigger: Fire to send TTS announcement
 *   - message: Dynamic text to speak (overrides static message)
 *   - streamUrl: Stream URL to play as background audio
 * 
 * Outputs:
 *   - success: Boolean - true when TTS sent successfully
 *   - streaming: Boolean - true when background stream is playing
 */
(function() {
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[TTSAnnouncementNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;

    // Default stations
    const DEFAULT_STATIONS = [
        { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
        { name: 'SomaFM Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
        { name: 'Jazz24', url: 'https://live.wostreaming.net/direct/ppm-jazz24aac-ibc1' }
    ];

    // Tooltips
    const tooltips = {
        node: "Combined TTS + Streaming: Play background music, interrupt for announcements, then resume. Like a DJ booth for your smart home.",
        inputs: {
            trigger: "When true, sends the TTS announcement (pauses stream, speaks, resumes)",
            message: "Dynamic message text (overrides the static message field)",
            streamUrl: "URL of an internet radio stream. When connected, plays as background audio."
        },
        outputs: {
            success: "True when TTS announcement sent successfully",
            streaming: "True when background stream is currently playing"
        },
        controls: {
            mediaPlayer: "Select speaker(s) for both TTS and streaming",
            message: "Static TTS message (or connect dynamic message input)",
            test: "Send a test announcement now",
            stream: "Background stream controls - select station or enter custom URL"
        }
    };

    class TTSAnnouncementNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Audio Output");
            this.changeCallback = changeCallback;
            this.width = 300;
            this.height = 520;

            this.properties = {
                // TTS properties
                mediaPlayerIds: [],
                mediaPlayerId: '',
                ttsEnabledSpeakers: {},  // { 'media_player.xxx': true/false } - which speakers receive TTS
                message: 'Hello, this is a test announcement',
                ttsService: 'tts/speak',
                ttsEntityId: '',
                elevenLabsVoiceId: '',
                elevenLabsVoiceName: '',
                lastResult: null,
                
                // Streaming properties
                stations: [...DEFAULT_STATIONS],
                selectedStation: 0,  // Default station for new speakers
                speakerStations: {},  // Per-speaker station index { 'media_player.xxx': 0 }
                speakerCustomUrls: {},  // Per-speaker custom URLs (set via automation)
                customStreamUrl: '',
                streamVolume: 50,  // Legacy: single volume for all
                speakerVolumes: {},  // Per-speaker volumes { 'media_player.xxx': 50 }
                linkVolumes: false,  // When true, master slider controls all
                isStreaming: false,
                streamEnabled: false,  // Master toggle
                
                // Pause/resume coordination
                // Buffer after TTS finishes before resuming stream
                resumeDelay: 2000,  // ms buffer after TTS ends before resuming (2s to avoid truncation)
                wasStreamingBeforeTTS: false
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addInput('message', new ClassicPreset.Input(sockets.any, 'Message'));
            this.addInput('streamUrl', new ClassicPreset.Input(sockets.any, 'Stream URL'));
            // Dynamic per-speaker inputs (volume, active, station) added via updateVolumeInputs()

            // Outputs
            this.addOutput('success', new ClassicPreset.Output(sockets.boolean, 'Success'));
            this.addOutput('streaming', new ClassicPreset.Output(sockets.boolean, 'Streaming'));

            // Track last trigger for edge detection
            this._lastTrigger = false;
            this._lastSentTime = 0;
            this._resumeTimeout = null;
            this._volumeInputKeys = [];  // Track dynamic volume input keys
            this._activeInputKeys = [];  // Track dynamic active input keys
            this._stationInputKeys = []; // Track dynamic station input keys
            this._lastActiveStates = {}; // Track last active state per speaker for edge detection
            this._lastStationInputs = {}; // Track last station input values for edge detection ("last write wins")
            this._needsVolumeSync = false; // Force volume sync after restore
        }

        // Update dynamic volume inputs based on selected speakers
        updateVolumeInputs(speakerIds, speakerNames = {}) {
            // Remove old volume inputs that are no longer needed
            const newInputKeys = speakerIds.map(id => `vol_${id.replace('media_player.', '')}`);
            
            for (const oldKey of this._volumeInputKeys) {
                if (!newInputKeys.includes(oldKey)) {
                    this.removeInput(oldKey);
                }
            }
            
            // Add new volume inputs for each speaker
            for (const speakerId of speakerIds) {
                const inputKey = `vol_${speakerId.replace('media_player.', '')}`;
                if (!this.inputs[inputKey]) {
                    const shortName = speakerNames[speakerId] || speakerId.split('.').pop();
                    this.addInput(inputKey, new ClassicPreset.Input(sockets.number, `🔊 ${shortName}`));
                }
            }
            
            this._volumeInputKeys = newInputKeys;
            
            // Also update active and station inputs
            this.updateActiveInputs(speakerIds, speakerNames);
            this.updateStationInputs(speakerIds, speakerNames);
            
            // Trigger UI refresh
            if (this.changeCallback) this.changeCallback();
        }

        // Update dynamic active inputs based on selected speakers
        updateActiveInputs(speakerIds, speakerNames = {}) {
            // Remove old active inputs that are no longer needed
            const newInputKeys = speakerIds.map(id => `active_${id.replace('media_player.', '')}`);
            
            for (const oldKey of this._activeInputKeys) {
                if (!newInputKeys.includes(oldKey)) {
                    this.removeInput(oldKey);
                }
            }
            
            // Add new active inputs for each speaker
            for (const speakerId of speakerIds) {
                const inputKey = `active_${speakerId.replace('media_player.', '')}`;
                if (!this.inputs[inputKey]) {
                    const shortName = speakerNames[speakerId] || speakerId.split('.').pop();
                    this.addInput(inputKey, new ClassicPreset.Input(sockets.boolean, `▶️ ${shortName}`));
                }
            }
            
            this._activeInputKeys = newInputKeys;
        }

        // Update dynamic station inputs based on selected speakers
        updateStationInputs(speakerIds, speakerNames = {}) {
            // Remove old station inputs that are no longer needed
            const newInputKeys = speakerIds.map(id => `station_${id.replace('media_player.', '')}`);
            
            for (const oldKey of this._stationInputKeys) {
                if (!newInputKeys.includes(oldKey)) {
                    this.removeInput(oldKey);
                }
            }
            
            // Add new station inputs for each speaker
            for (const speakerId of speakerIds) {
                const inputKey = `station_${speakerId.replace('media_player.', '')}`;
                if (!this.inputs[inputKey]) {
                    const shortName = speakerNames[speakerId] || speakerId.split('.').pop();
                    this.addInput(inputKey, new ClassicPreset.Input(sockets.number, `📻 ${shortName}`));
                }
            }
            
            this._stationInputKeys = newInputKeys;
        }

        // Get TTS-enabled speakers only
        getTTSSpeakerIds() {
            return this.getSpeakerIds().filter(id => 
                this.properties.ttsEnabledSpeakers?.[id] !== false  // Default to enabled
            );
        }

        getSpeakerIds() {
            if (this.properties.mediaPlayerIds && this.properties.mediaPlayerIds.length > 0) {
                return this.properties.mediaPlayerIds;
            }
            if (this.properties.mediaPlayerId) {
                return [this.properties.mediaPlayerId];
            }
            return [];
        }

        getStreamUrl() {
            // Custom URL takes priority, then selected station
            if (this.properties.customStreamUrl) {
                return this.properties.customStreamUrl;
            }
            const station = this.properties.stations[this.properties.selectedStation];
            return station?.url || '';
        }

        // Get stream URL for a specific speaker (uses per-speaker station if set)
        getStreamUrlForSpeaker(speakerId) {
            // Node-wide custom URL takes priority over everything
            if (this.properties.customStreamUrl) {
                return this.properties.customStreamUrl;
            }
            // Per-speaker custom URL (set via automation)
            if (this.properties.speakerCustomUrls?.[speakerId]) {
                return this.properties.speakerCustomUrls[speakerId];
            }
            // Check if this speaker has a specific station assigned
            const speakerStationIdx = this.properties.speakerStations?.[speakerId];
            const stationIdx = (speakerStationIdx !== undefined) ? speakerStationIdx : this.properties.selectedStation;
            const station = this.properties.stations[stationIdx];
            return station?.url || '';
        }

        // Get station index for a specific speaker
        getSpeakerStation(speakerId) {
            return this.properties.speakerStations?.[speakerId] ?? this.properties.selectedStation;
        }

        // Set station for a specific speaker
        setSpeakerStation(speakerId, stationIndex) {
            if (!this.properties.speakerStations) {
                this.properties.speakerStations = {};
            }
            this.properties.speakerStations[speakerId] = stationIndex;
            console.log(`[AudioOutput] 📻 Set station ${stationIndex} for ${speakerId}`);
        }

        // Helper: play stream on single speaker with retry
        async playSingleSpeaker(speaker, streamUrl, attempt = 1, forceStop = false) {
            const maxAttempts = 2;
            const volume = this.getSpeakerVolume(speaker);
            try {
                // If forceStop is true, stop the current stream first (helps with station changes)
                if (forceStop) {
                    console.log(`[AudioOutput] ⏹️ Force-stopping ${speaker} before starting new stream`);
                    await (window.apiFetch || fetch)('/api/media/stop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entityId: speaker })
                    });
                    // Brief delay to let the stop command complete
                    await new Promise(r => setTimeout(r, 300));
                }
                
                const response = await (window.apiFetch || fetch)('/api/media/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityId: speaker,
                        mediaUrl: streamUrl,
                        mediaType: 'music',
                        volume: volume / 100
                    })
                });
                if (response.ok) {
                    console.log(`[AudioOutput] ✓ Stream started on ${speaker} (attempt ${attempt})`);
                    return true;
                } else {
                    console.warn(`[AudioOutput] ✗ Failed ${speaker}: HTTP ${response.status} (attempt ${attempt})`);
                    if (attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
                        return this.playSingleSpeaker(speaker, streamUrl, attempt + 1, false);
                    }
                    return false;
                }
            } catch (err) {
                console.error(`[AudioOutput] ✗ Error on ${speaker}: ${err.message} (attempt ${attempt})`);
                if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000));
                    return this.playSingleSpeaker(speaker, streamUrl, attempt + 1, false);
                }
                return false;
            }
        }

        async playStream() {
            const speakerIds = this.getSpeakerIds();

            if (speakerIds.length === 0) {
                console.warn('[AudioOutput] No speaker selected');
                return false;
            }

            console.log(`[AudioOutput] ▶️ Playing stream on ${speakerIds.length} speaker(s):`, speakerIds);

            try {
                // Stagger requests slightly to avoid overwhelming HA
                const results = [];
                for (let i = 0; i < speakerIds.length; i++) {
                    if (i > 0) await new Promise(r => setTimeout(r, 300)); // 300ms gap between speakers
                    // Use per-speaker station URL
                    const streamUrl = this.getStreamUrlForSpeaker(speakerIds[i]);
                    if (!streamUrl) {
                        console.warn(`[AudioOutput] No stream URL for ${speakerIds[i]}`);
                        results.push(false);
                        continue;
                    }
                    const success = await this.playSingleSpeaker(speakerIds[i], streamUrl);
                    results.push(success);
                }
                
                const successCount = results.filter(r => r).length;
                this.properties.isStreaming = successCount > 0;
                console.log(`[AudioOutput] Stream started on ${successCount}/${speakerIds.length} speakers`);
                if (this.changeCallback) this.changeCallback();
                return successCount > 0;
            } catch (err) {
                console.error('[AudioOutput] Play error:', err);
                return false;
            }
        }

        // Helper: stop single speaker with retry
        async stopSingleSpeaker(speaker, attempt = 1) {
            const maxAttempts = 2;
            try {
                const response = await (window.apiFetch || fetch)('/api/media/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entityId: speaker })
                });
                if (response.ok) {
                    console.log(`[AudioOutput] ✓ Stopped ${speaker} (attempt ${attempt})`);
                    return true;
                } else {
                    console.warn(`[AudioOutput] ✗ Failed to stop ${speaker}: HTTP ${response.status} (attempt ${attempt})`);
                    if (attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 1000));
                        return this.stopSingleSpeaker(speaker, attempt + 1);
                    }
                    return false;
                }
            } catch (err) {
                console.error(`[AudioOutput] ✗ Error stopping ${speaker}: ${err.message} (attempt ${attempt})`);
                if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000));
                    return this.stopSingleSpeaker(speaker, attempt + 1);
                }
                return false;
            }
        }

        async stopStream() {
            const speakerIds = this.getSpeakerIds();
            if (speakerIds.length === 0) return;

            console.log(`[AudioOutput] ⏹️ Stopping stream on ${speakerIds.length} speaker(s):`, speakerIds);

            try {
                // Stop on all speakers with staggered timing (same as play)
                const results = [];
                for (let i = 0; i < speakerIds.length; i++) {
                    if (i > 0) await new Promise(r => setTimeout(r, 300)); // 300ms gap between speakers
                    const success = await this.stopSingleSpeaker(speakerIds[i]);
                    results.push(success);
                }
                
                const successCount = results.filter(r => r).length;
                console.log(`[AudioOutput] Stopped ${successCount}/${speakerIds.length} speakers`);
                this.properties.isStreaming = false;
                if (this.changeCallback) this.changeCallback();
            } catch (err) {
                console.error('[AudioOutput] Stop error:', err);
            }
        }

        // Set volume on a specific speaker (for dynamic volume control)
        async setVolume(speakerId, volume) {
            const volumeLevel = volume / 100;  // Convert 0-100 to 0-1
            console.log(`[AudioOutput] 🔊 Setting volume to ${volume}% on ${speakerId}`);

            try {
                await (window.apiFetch || fetch)('/api/media/volume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityId: speakerId,
                        volume: volumeLevel
                    })
                });
            } catch (err) {
                console.error('[AudioOutput] Volume set error:', err);
            }
        }

        // Get volume for a specific speaker (with fallback to legacy streamVolume)
        getSpeakerVolume(speakerId) {
            return this.properties.speakerVolumes?.[speakerId] ?? this.properties.streamVolume ?? 50;
        }

        // Set volume in properties for a specific speaker
        setSpeakerVolume(speakerId, volume) {
            if (!this.properties.speakerVolumes) {
                this.properties.speakerVolumes = {};
            }
            this.properties.speakerVolumes[speakerId] = volume;
        }

        // Fetch current volume from HA and update the slider
        fetchSpeakerVolume(speakerId) {
            return new Promise((resolve) => {
                if (!window.socket) {
                    console.log(`[AudioOutput] ⚠️ No socket for volume fetch`);
                    resolve(null);
                    return;
                }

                const timeout = setTimeout(() => {
                    console.log(`[AudioOutput] ⏰ Volume fetch timeout for ${speakerId}`);
                    resolve(null);
                }, 3000);

                window.socket.emit('get-entity-state', { entityId: speakerId }, (response) => {
                    clearTimeout(timeout);
                    
                    // Extract volume_level from attributes (HA returns 0-1)
                    let volumeLevel = null;
                    if (response?.state?.attributes?.volume_level !== undefined) {
                        volumeLevel = Math.round(response.state.attributes.volume_level * 100);
                    } else if (response?.attributes?.volume_level !== undefined) {
                        volumeLevel = Math.round(response.attributes.volume_level * 100);
                    }
                    
                    if (volumeLevel !== null) {
                        console.log(`[AudioOutput] 📊 Fetched volume for ${speakerId}: ${volumeLevel}%`);
                        this.setSpeakerVolume(speakerId, volumeLevel);
                        if (this.changeCallback) this.changeCallback();
                    } else {
                        console.log(`[AudioOutput] ⚠️ No volume_level in response for ${speakerId}`);
                    }
                    
                    resolve(volumeLevel);
                });
            });
        }

        // Fetch volumes for all selected speakers
        async fetchAllSpeakerVolumes() {
            const speakerIds = this.getSpeakerIds();
            console.log(`[AudioOutput] 📊 Fetching volumes for ${speakerIds.length} speaker(s)...`);
            
            for (const speakerId of speakerIds) {
                // Only fetch if we don't already have a saved volume
                if (this.properties.speakerVolumes?.[speakerId] === undefined) {
                    await this.fetchSpeakerVolume(speakerId);
                }
            }
        }

        async pauseStreamForTTS(ttsSpeakerIds) {
            if (this.properties.isStreaming && ttsSpeakerIds?.length > 0) {
                console.log(`[AudioOutput] ⏸️ Pausing stream on TTS-enabled speakers only:`, ttsSpeakerIds);
                this.properties.wasStreamingBeforeTTS = true;
                this.properties.pausedSpeakerIds = ttsSpeakerIds;  // Remember which ones we paused
                
                // Only stop the TTS-enabled speakers, leave others playing
                for (let i = 0; i < ttsSpeakerIds.length; i++) {
                    if (i > 0) await new Promise(r => setTimeout(r, 300));
                    await this.stopSingleSpeaker(ttsSpeakerIds[i]);
                }
                
                // Give speaker time to fully stop and be ready for TTS
                // Denon/receivers need ~1s to switch audio modes
                console.log(`[AudioOutput] ⏳ Waiting 1s for speaker to be ready...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Poll media player state to detect when TTS actually finishes
        // Returns a Promise that resolves when the speaker goes from 'playing' back to 'idle'
        async waitForTTSCompletion(speakerId, maxWaitMs = 60000) {
            return new Promise((resolve) => {
                const startTime = Date.now();
                let sawPlaying = false;
                let pollCount = 0;
                let lastState = 'unknown';
                let stuckCount = 0;  // Track if we're getting stuck
                
                console.log(`[AudioOutput] 👂 Waiting for TTS completion on ${speakerId} (max ${maxWaitMs/1000}s)...`);
                
                const checkState = () => {
                    pollCount++;
                    const elapsed = Date.now() - startTime;
                    
                    // Timeout safety
                    if (elapsed > maxWaitMs) {
                        console.log(`[AudioOutput] ⏰ TTS wait timeout after ${maxWaitMs/1000}s - resuming anyway`);
                        resolve();
                        return;
                    }
                    
                    // Safety: if we've polled 10+ times without ever seeing 'playing', 
                    // the TTS might have finished before we started polling, or state reporting is broken
                    if (pollCount > 10 && !sawPlaying) {
                        console.log(`[AudioOutput] ⚠️ Never saw 'playing' state after ${pollCount} polls (last state: ${lastState}). TTS may have finished quickly - resuming.`);
                        resolve();
                        return;
                    }
                    
                    // Request entity state from HA
                    if (window.socket) {
                        // Set a timeout in case the callback never fires
                        const callbackTimeout = setTimeout(() => {
                            stuckCount++;
                            console.log(`[AudioOutput] ⚠️ State callback timeout (attempt ${stuckCount}), retrying...`);
                            if (stuckCount > 3) {
                                console.log(`[AudioOutput] ❌ Callback not responding - using fallback timing`);
                                resolve();
                            } else {
                                setTimeout(checkState, 500);
                            }
                        }, 1500);
                        
                        window.socket.emit('get-entity-state', { entityId: speakerId }, (response) => {
                            clearTimeout(callbackTimeout);
                            stuckCount = 0;  // Reset stuck counter on successful callback
                            
                            // Extract state - handle nested structure: response.state.state or response.state
                            let state = 'unknown';
                            if (typeof response === 'string') {
                                state = response;
                            } else if (response?.state) {
                                // Server returns {state: {state: "idle", ...}} - need to dig into nested structure
                                if (typeof response.state === 'object' && response.state.state) {
                                    state = response.state.state;
                                } else if (typeof response.state === 'string') {
                                    state = response.state;
                                }
                            }
                            lastState = state;
                            
                            // Log every state change or every 5 polls
                            if (pollCount % 5 === 0 || state !== lastState) {
                                console.log(`[AudioOutput] 📡 Poll ${pollCount}: ${speakerId} state = "${state}" (sawPlaying=${sawPlaying})`);
                            }
                            
                            if (state === 'playing') {
                                sawPlaying = true;
                                console.log(`[AudioOutput] 🔊 TTS playing on ${speakerId}... (${Math.round(elapsed/1000)}s)`);
                            } else if (sawPlaying && (state === 'idle' || state === 'paused' || state === 'off' || state === 'standby')) {
                                // Was playing, now idle = TTS finished!
                                console.log(`[AudioOutput] ✅ TTS completed on ${speakerId} after ${Math.round(elapsed/1000)}s (polled ${pollCount} times)`);
                                resolve();
                                return;
                            }
                            
                            // Keep polling
                            setTimeout(checkState, 500);
                        });
                    } else {
                        console.log(`[AudioOutput] ⚠️ No socket available for state polling`);
                        // No socket, just wait 10 seconds and resolve
                        setTimeout(() => resolve(), 10000);
                    }
                };
                
                // Start polling after a brief delay to let TTS start
                setTimeout(checkState, 1000);
            });
        }

        async resumeStreamAfterTTS(message, speakerIds) {
            // Clear any pending resume
            if (this._resumeTimeout) {
                clearTimeout(this._resumeTimeout);
            }
            
            console.log(`[AudioOutput] 📢 TTS sent. Waiting for actual playback completion...`);
            
            // Get speaker IDs - use passed ones or fall back to node's speakers
            const speakers = speakerIds || this.getSpeakerIds();
            
            // Wait for TTS to actually finish on the first speaker (they should all finish ~same time)
            const primarySpeaker = speakers[0];
            if (primarySpeaker) {
                await this.waitForTTSCompletion(primarySpeaker);
            }
            
            // Add small buffer after TTS ends
            console.log(`[AudioOutput] ⏳ TTS done. Waiting ${this.properties.resumeDelay}ms buffer before resuming stream...`);
            await new Promise(r => setTimeout(r, this.properties.resumeDelay));
            
            // Now resume - only on the speakers we paused (TTS-enabled ones)
            if (this.properties.wasStreamingBeforeTTS && this.properties.streamEnabled) {
                const pausedSpeakers = this.properties.pausedSpeakerIds || speakers;
                console.log(`[AudioOutput] 🔄 Resuming stream on paused speakers:`, pausedSpeakers);
                
                // Resume only the paused speakers with their per-speaker URLs
                for (let i = 0; i < pausedSpeakers.length; i++) {
                    if (i > 0) await new Promise(r => setTimeout(r, 300));
                    const streamUrl = this.getStreamUrlForSpeaker(pausedSpeakers[i]);
                    await this.playSingleSpeaker(pausedSpeakers[i], streamUrl);
                }
                
                this.properties.wasStreamingBeforeTTS = false;
                this.properties.pausedSpeakerIds = null;
            } else {
                console.log(`[AudioOutput] ⏭️ Skipping resume (wasStreaming=${this.properties.wasStreamingBeforeTTS}, enabled=${this.properties.streamEnabled})`);
            }
        }

        async sendTTS(message, speakerIds) {
            if (!window.socket) return false;
            
            console.log(`[AudioOutput] 🎤 Sending TTS to ${speakerIds.length} speaker(s): "${message.substring(0, 50)}..."`);
            console.log(`[AudioOutput] 🎙️ TTS service: ${this.properties.ttsService}, ElevenLabs voiceId: "${this.properties.elevenLabsVoiceId || '(none)'}"`);
            
            if (this.properties.ttsService === 'elevenlabs') {
                // Set up one-time listener for the result
                const resultPromise = new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.log(`[AudioOutput] ⏰ ElevenLabs result timeout (10s)`);
                        window.socket.off('elevenlabs-tts-result', handler);
                        resolve(false);
                    }, 10000);
                    
                    const handler = (result) => {
                        clearTimeout(timeout);
                        window.socket.off('elevenlabs-tts-result', handler);
                        if (result.success) {
                            console.log(`[AudioOutput] ✅ ElevenLabs TTS success`);
                            resolve(true);
                        } else {
                            console.log(`[AudioOutput] ❌ ElevenLabs TTS failed: ${result.error}`);
                            resolve(false);
                        }
                    };
                    window.socket.on('elevenlabs-tts-result', handler);
                });
                
                window.socket.emit('request-elevenlabs-tts', {
                    message: message,
                    voiceId: this.properties.elevenLabsVoiceId,
                    mediaPlayerIds: speakerIds
                });
                
                return await resultPromise;
            } else {
                // Send TTS to each speaker with small stagger
                for (let i = 0; i < speakerIds.length; i++) {
                    const speakerId = speakerIds[i];
                    console.log(`[AudioOutput] 📢 TTS -> ${speakerId}`);
                    window.socket.emit('request-tts', {
                        entityId: speakerId,
                        message: message,
                        options: { 
                            tts_service: this.properties.ttsService,
                            tts_entity_id: this.properties.ttsEntityId
                        }
                    });
                    // Small delay between TTS commands to not overwhelm HA
                    if (i < speakerIds.length - 1) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            }
            return true;
        }

        async data(inputs) {
            const trigger = inputs.trigger?.[0];
            const dynamicMessage = inputs.message?.[0];
            const dynamicStreamUrl = inputs.streamUrl?.[0];

            // Handle dynamic volume inputs from automation
            // After restore, force-sync volumes even if values match (device might be different)
            const forceVolumeSync = this._needsVolumeSync;
            let syncedAnyVolume = false;
            
            for (const speakerId of this.getSpeakerIds()) {
                const inputKey = `vol_${speakerId.replace('media_player.', '')}`;
                const volumeInput = inputs[inputKey]?.[0];
                if (volumeInput !== undefined && volumeInput !== null) {
                    const vol = Math.max(0, Math.min(100, Math.round(volumeInput)));
                    const currentVol = this.getSpeakerVolume(speakerId);
                    // Update if changed OR if we need to force-sync after restore
                    if (vol !== currentVol || forceVolumeSync) {
                        if (forceVolumeSync) {
                            console.log(`[AudioOutput] 🔄 Force-syncing volume ${vol}% to ${speakerId}`);
                        }
                        this.setSpeakerVolume(speakerId, vol);
                        this.setVolume(speakerId, vol);
                        syncedAnyVolume = true;
                    }
                }
            }
            
            // Only clear the force-sync flag after we've actually processed volume inputs
            // This handles the case where data() is called before connections are restored
            if (forceVolumeSync && syncedAnyVolume) {
                this._needsVolumeSync = false;
            }

            // Handle dynamic active inputs from automation (per-speaker play/stop)
            for (const speakerId of this.getSpeakerIds()) {
                const inputKey = `active_${speakerId.replace('media_player.', '')}`;
                const activeInput = inputs[inputKey]?.[0];
                
                // Only process if input is connected (not undefined)
                if (activeInput !== undefined) {
                    const wasActive = this._lastActiveStates[speakerId] || false;
                    const isActive = !!activeInput;
                    
                    // Edge detection: only act on changes
                    if (isActive !== wasActive) {
                        this._lastActiveStates[speakerId] = isActive;
                        
                        if (isActive) {
                            // Rising edge: start this speaker
                            const streamUrl = this.getStreamUrlForSpeaker(speakerId);
                            if (streamUrl) {
                                console.log(`[AudioOutput] ▶️ Active input ON → starting ${speakerId}`);
                                this.playSingleSpeaker(speakerId, streamUrl);
                            } else {
                                console.warn(`[AudioOutput] ⚠️ No stream URL for ${speakerId}`);
                            }
                        } else {
                            // Falling edge: stop this speaker
                            console.log(`[AudioOutput] ⏹️ Active input OFF → stopping ${speakerId}`);
                            this.stopSingleSpeaker(speakerId);
                        }
                    }
                }
            }

            // Handle dynamic station inputs from automation (per-speaker station override)
            // Uses edge detection: only apply when the INPUT value changes ("last write wins")
            for (const speakerId of this.getSpeakerIds()) {
                const inputKey = `station_${speakerId.replace('media_player.', '')}`;
                const stationInput = inputs[inputKey]?.[0];
                
                // Only process if input is connected (not undefined)
                if (stationInput !== undefined && stationInput !== null) {
                    // Edge detection: only process if the INPUT value changed
                    const lastInputValue = this._lastStationInputs?.[speakerId];
                    if (stationInput === lastInputValue) {
                        // Same input value as last tick - skip (allows UI changes to stick)
                        continue;
                    }
                    
                    // Input value changed - update tracking and process
                    if (!this._lastStationInputs) this._lastStationInputs = {};
                    this._lastStationInputs[speakerId] = stationInput;
                    
                    // Station input can be: number (index), string (station name or URL)
                    let stationIndex = null;
                    let customUrl = null;
                    
                    if (typeof stationInput === 'number') {
                        // Direct station index
                        stationIndex = Math.max(0, Math.min(this.properties.stations.length - 1, Math.floor(stationInput)));
                    } else if (typeof stationInput === 'string') {
                        if (stationInput.startsWith('http')) {
                            // It's a URL
                            customUrl = stationInput;
                        } else {
                            // Try to find station by name
                            const foundIdx = this.properties.stations.findIndex(s => 
                                s.name.toLowerCase() === stationInput.toLowerCase()
                            );
                            if (foundIdx >= 0) {
                                stationIndex = foundIdx;
                            }
                        }
                    }
                    
                    // Apply the station change (we already know input changed via edge detection)
                    if (customUrl) {
                        // Custom URL for this speaker
                        if (!this.properties.speakerCustomUrls) {
                            this.properties.speakerCustomUrls = {};
                        }
                        this.properties.speakerCustomUrls[speakerId] = customUrl;
                        console.log(`[AudioOutput] 📻 Station input changed: Custom URL for ${speakerId}`);
                        // Restart stream if playing
                        const speakerIsPlaying = this.properties.isStreaming || this._lastActiveStates?.[speakerId];
                        if (speakerIsPlaying) {
                            this.playSingleSpeaker(speakerId, customUrl, 1, true); // forceStop=true for station change
                        }
                    } else if (stationIndex !== null) {
                        // Clear any custom URL
                        if (this.properties.speakerCustomUrls?.[speakerId]) {
                            delete this.properties.speakerCustomUrls[speakerId];
                        }
                        this.setSpeakerStation(speakerId, stationIndex);
                        
                        // Check if this speaker is actively playing (via automation OR global stream)
                        const speakerIsPlaying = this.properties.isStreaming || this._lastActiveStates?.[speakerId];
                        console.log(`[AudioOutput] 📻 Station input changed to ${stationIndex} for ${speakerId}, playing=${speakerIsPlaying}`);
                        
                        // Restart stream if this speaker is playing - use forceStop to ensure station change takes effect
                        if (speakerIsPlaying) {
                            const streamUrl = this.getStreamUrlForSpeaker(speakerId);
                            console.log(`[AudioOutput] 📻 Switching to: ${streamUrl}`);
                            this.playSingleSpeaker(speakerId, streamUrl, 1, true); // forceStop=true for station change
                        }
                    }
                }
            }

            // Handle dynamic stream URL input
            if (dynamicStreamUrl && dynamicStreamUrl !== this.properties.customStreamUrl) {
                this.properties.customStreamUrl = dynamicStreamUrl;
                // If streaming is enabled and we're playing, switch to new URL
                if (this.properties.streamEnabled && this.properties.isStreaming) {
                    this.playStream();
                }
            }

            // TTS trigger - rising edge detection
            const triggerIsTrue = trigger === true;
            const wasTriggered = this._lastTrigger === true;
            const now = Date.now();
            const debounceMs = 1000;
            const ttsSpeakerIds = this.getTTSSpeakerIds();  // Only TTS-enabled speakers

            if (triggerIsTrue && !wasTriggered && (now - this._lastSentTime) > debounceMs) {
                this._lastTrigger = true;
                this._lastSentTime = now;

                const message = (dynamicMessage !== undefined && dynamicMessage !== null && dynamicMessage !== '')
                    ? dynamicMessage
                    : this.properties.message;

                if (ttsSpeakerIds.length > 0 && message) {
                    // Pause stream, send TTS, wait for completion, resume
                    await this.pauseStreamForTTS(ttsSpeakerIds);
                    const success = await this.sendTTS(message, ttsSpeakerIds);
                    this.properties.lastResult = success;
                    // Don't await - let it run in background so data() returns immediately
                    this.resumeStreamAfterTTS(message, ttsSpeakerIds);
                }
            } else if (!triggerIsTrue) {
                this._lastTrigger = false;
            }

            return {
                success: this.properties.lastResult ?? false,
                streaming: this.properties.isStreaming
            };
        }

        serialize() {
            return {
                mediaPlayerIds: this.properties.mediaPlayerIds,
                mediaPlayerId: this.properties.mediaPlayerId,
                ttsEnabledSpeakers: this.properties.ttsEnabledSpeakers,
                message: this.properties.message,
                ttsService: this.properties.ttsService,
                ttsEntityId: this.properties.ttsEntityId,
                elevenLabsVoiceId: this.properties.elevenLabsVoiceId,
                elevenLabsVoiceName: this.properties.elevenLabsVoiceName,
                stations: this.properties.stations,
                selectedStation: this.properties.selectedStation,
                speakerStations: this.properties.speakerStations,
                speakerCustomUrls: this.properties.speakerCustomUrls,
                customStreamUrl: this.properties.customStreamUrl,
                streamVolume: this.properties.streamVolume,
                speakerVolumes: this.properties.speakerVolumes,
                linkVolumes: this.properties.linkVolumes,
                streamEnabled: this.properties.streamEnabled,
                resumeDelay: this.properties.resumeDelay,
                nodeWidth: this.properties.nodeWidth,
                nodeHeight: this.properties.nodeHeight,
                // UI section states
                showIOSection: this.properties.showIOSection,
                showSpeakersSection: this.properties.showSpeakersSection,
                showTTSSection: this.properties.showTTSSection,
                showStreamSection: this.properties.showStreamSection
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.mediaPlayerIds !== undefined) this.properties.mediaPlayerIds = props.mediaPlayerIds;
            if (props.mediaPlayerId !== undefined) this.properties.mediaPlayerId = props.mediaPlayerId;
            if (props.ttsEnabledSpeakers !== undefined) this.properties.ttsEnabledSpeakers = props.ttsEnabledSpeakers;
            if (props.message !== undefined) this.properties.message = props.message;
            if (props.ttsService !== undefined) this.properties.ttsService = props.ttsService;
            if (props.ttsEntityId !== undefined) this.properties.ttsEntityId = props.ttsEntityId;
            if (props.elevenLabsVoiceId !== undefined) this.properties.elevenLabsVoiceId = props.elevenLabsVoiceId;
            if (props.elevenLabsVoiceName !== undefined) this.properties.elevenLabsVoiceName = props.elevenLabsVoiceName;
            if (props.stations !== undefined) this.properties.stations = props.stations;
            if (props.selectedStation !== undefined) this.properties.selectedStation = props.selectedStation;
            if (props.speakerStations !== undefined) this.properties.speakerStations = props.speakerStations;
            if (props.speakerCustomUrls !== undefined) this.properties.speakerCustomUrls = props.speakerCustomUrls;
            if (props.customStreamUrl !== undefined) this.properties.customStreamUrl = props.customStreamUrl;
            if (props.streamVolume !== undefined) this.properties.streamVolume = props.streamVolume;
            if (props.speakerVolumes !== undefined) this.properties.speakerVolumes = props.speakerVolumes;
            if (props.linkVolumes !== undefined) this.properties.linkVolumes = props.linkVolumes;
            if (props.streamEnabled !== undefined) this.properties.streamEnabled = props.streamEnabled;
            if (props.resumeDelay !== undefined) this.properties.resumeDelay = props.resumeDelay;
            if (props.nodeWidth !== undefined) this.properties.nodeWidth = props.nodeWidth;
            if (props.nodeHeight !== undefined) this.properties.nodeHeight = props.nodeHeight;
            // UI section states
            if (props.showIOSection !== undefined) this.properties.showIOSection = props.showIOSection;
            if (props.showSpeakersSection !== undefined) this.properties.showSpeakersSection = props.showSpeakersSection;
            if (props.showTTSSection !== undefined) this.properties.showTTSSection = props.showTTSSection;
            if (props.showStreamSection !== undefined) this.properties.showStreamSection = props.showStreamSection;

            // Migrate legacy
            if (!this.properties.mediaPlayerIds?.length && this.properties.mediaPlayerId) {
                this.properties.mediaPlayerIds = [this.properties.mediaPlayerId];
            }
            
            // Recreate dynamic volume inputs SYNCHRONOUSLY after restore
            // This must be synchronous so connections can be restored to these inputs
            if (this.properties.mediaPlayerIds?.length > 0) {
                this.updateVolumeInputs(this.properties.mediaPlayerIds);
            }
            
            // Mark that we need to force-sync volumes on next data() call
            // This ensures device volumes match saved values after app restart
            this._needsVolumeSync = true;
        }

        destroy() {
            if (this._resumeTimeout) {
                clearTimeout(this._resumeTimeout);
            }
        }
    }

    // React Component
    function TTSAnnouncementComponent({ data, emit }) {
        const [mediaPlayers, setMediaPlayers] = useState([]);
        const [ttsEntities, setTtsEntities] = useState([]);
        const [elevenLabsVoices, setElevenLabsVoices] = useState([]);
        const [selectedPlayers, setSelectedPlayers] = useState(data.properties.mediaPlayerIds || []);
        const [selectedTtsEntity, setSelectedTtsEntity] = useState(data.properties.ttsEntityId || '');
        const [selectedVoice, setSelectedVoice] = useState(data.properties.elevenLabsVoiceId || '');
        const [message, setMessage] = useState(data.properties.message || '');
        const [ttsService, setTtsService] = useState(data.properties.ttsService || 'tts/speak');
        const [testStatus, setTestStatus] = useState('');
        const [showSpeakerList, setShowSpeakerList] = useState(false);
        const [ttsEnabledSpeakers, setTtsEnabledSpeakers] = useState(data.properties.ttsEnabledSpeakers || {});
        
        // Streaming state
        const [stations, setStations] = useState(data.properties.stations || [...DEFAULT_STATIONS]);
        const [selectedStation, setSelectedStation] = useState(data.properties.selectedStation || 0);
        const [speakerStations, setSpeakerStations] = useState(data.properties.speakerStations || {});
        const [customStreamUrl, setCustomStreamUrl] = useState(data.properties.customStreamUrl || '');
        const [speakerVolumes, setSpeakerVolumes] = useState(data.properties.speakerVolumes || {});
        const [linkVolumes, setLinkVolumes] = useState(data.properties.linkVolumes || false);
        const [streamEnabled, setStreamEnabled] = useState(data.properties.streamEnabled || false);
        const [isStreaming, setIsStreaming] = useState(data.properties.isStreaming || false);
        const [showStationEditor, setShowStationEditor] = useState(false);
        const [editingStation, setEditingStation] = useState(null);
        
        // Stream discovery state
        const [stationEditorMode, setStationEditorMode] = useState('browse'); // 'manual' or 'browse'
        const [streamSearch, setStreamSearch] = useState('');
        const [streamSearchResults, setStreamSearchResults] = useState([]);
        const [streamSearchLoading, setStreamSearchLoading] = useState(false);
        const [streamGenres, setStreamGenres] = useState(['pop', 'rock', 'jazz', 'classical', 'electronic', 'ambient', 'news', 'talk']);
        
        // Debounce refs for volume sliders
        const volumeDebounceRefs = useRef({});
        
        // Collapsed sections - persist state from node properties, default to sensible values
        const [showIOSection, setShowIOSection] = useState(data.properties.showIOSection ?? false);
        const [showSpeakersSection, setShowSpeakersSection] = useState(data.properties.showSpeakersSection ?? true);
        const [showTTSSection, setShowTTSSection] = useState(data.properties.showTTSSection ?? false);
        const [showStreamSection, setShowStreamSection] = useState(data.properties.showStreamSection ?? true);
        
        // Resizable node dimensions
        const [nodeWidth, setNodeWidth] = useState(data.properties.nodeWidth || 300);
        const [nodeHeight, setNodeHeight] = useState(data.properties.nodeHeight || null); // null = auto height
        
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Sync state from node (for automation inputs)
        useEffect(() => {
            const interval = setInterval(() => {
                setIsStreaming(data.properties.isStreaming);
                
                // Sync speaker volumes from automation inputs
                const nodeVolumes = data.properties.speakerVolumes || {};
                const volumeKeys = Object.keys(nodeVolumes);
                if (volumeKeys.length > 0) {
                    setSpeakerVolumes(prev => {
                        // Deep compare - check if any volume differs
                        let needsUpdate = false;
                        for (const id of volumeKeys) {
                            if (prev[id] !== nodeVolumes[id]) {
                                needsUpdate = true;
                                break;
                            }
                        }
                        // Also check if prev has keys not in nodeVolumes
                        for (const id of Object.keys(prev)) {
                            if (!(id in nodeVolumes)) {
                                needsUpdate = true;
                                break;
                            }
                        }
                        if (needsUpdate) {
                            return { ...nodeVolumes };
                        }
                        return prev;
                    });
                }
                
                // Sync speaker stations from automation inputs
                const nodeStations = data.properties.speakerStations || {};
                const stationKeys = Object.keys(nodeStations);
                setSpeakerStations(prev => {
                    const prevKeys = Object.keys(prev);
                    // If node has no stations but prev has some, clear it
                    if (stationKeys.length === 0 && prevKeys.length > 0) {
                        return {};
                    }
                    // If node has stations, sync them
                    if (stationKeys.length > 0) {
                        let needsUpdate = false;
                        for (const id of stationKeys) {
                            if (prev[id] !== nodeStations[id]) {
                                needsUpdate = true;
                                break;
                            }
                        }
                        // Also check if prev has keys not in nodeStations
                        for (const id of prevKeys) {
                            if (!(id in nodeStations)) {
                                needsUpdate = true;
                                break;
                            }
                        }
                        if (needsUpdate) {
                            return { ...nodeStations };
                        }
                    }
                    return prev;
                });
                
                // Sync global selectedStation from automation
                if (data.properties.selectedStation !== undefined) {
                    setSelectedStation(prev => {
                        if (prev !== data.properties.selectedStation) {
                            return data.properties.selectedStation;
                        }
                        return prev;
                    });
                }
                
                // Sync stations list (in case it was modified)
                if (data.properties.stations && data.properties.stations.length > 0) {
                    setStations(prev => {
                        if (JSON.stringify(prev) !== JSON.stringify(data.properties.stations)) {
                            return [...data.properties.stations];
                        }
                        return prev;
                    });
                }
            }, 250);  // Faster sync for more responsive UI
            return () => clearInterval(interval);
        }, []);  // No dependencies - always sync from node properties

        // Fetch volumes for existing speakers on mount
        useEffect(() => {
            if (selectedPlayers.length > 0 && window.socket) {
                // Delay slightly to let socket connection stabilize
                const timer = setTimeout(() => {
                    selectedPlayers.forEach(speakerId => {
                        // Only fetch if we don't have a saved volume for this speaker
                        if (data.properties.speakerVolumes?.[speakerId] === undefined) {
                            data.fetchSpeakerVolume(speakerId).then(vol => {
                                if (vol !== null) {
                                    setSpeakerVolumes(prev => ({ ...prev, [speakerId]: vol }));
                                }
                            });
                        }
                    });
                }, 500);
                return () => clearTimeout(timer);
            }
        }, []);  // Only on mount

        // Publish stations to global registry for other nodes (like Station Selector)
        useEffect(() => {
            if (!window.T2StationRegistry) {
                window.T2StationRegistry = { stations: [] };
            }
            // Update global registry with this node's stations
            if (stations && stations.length > 0) {
                window.T2StationRegistry.stations = [...stations];
            }
        }, [stations]);

        // Migrate legacy
        useEffect(() => {
            if (data.properties.mediaPlayerId && !data.properties.mediaPlayerIds?.length) {
                const migrated = [data.properties.mediaPlayerId];
                setSelectedPlayers(migrated);
                data.properties.mediaPlayerIds = migrated;
            }
        }, []);

        // Fetch speakers and TTS entities
        useEffect(() => {
            if (!window.socket) return;

            const onMediaPlayers = (players) => setMediaPlayers(players || []);
            const onTtsEntities = (entities) => {
                setTtsEntities(entities || []);
                if (!selectedTtsEntity && entities?.length > 0) {
                    const first = entities[0]?.entity_id || '';
                    setSelectedTtsEntity(first);
                    data.properties.ttsEntityId = first;
                }
            };
            const onElevenLabsVoices = (voices) => {
                if (voices?.error) {
                    setElevenLabsVoices([]);
                } else {
                    setElevenLabsVoices(voices || []);
                    if (!selectedVoice && voices?.length > 0) {
                        const charlotte = voices.find(v => v.name?.toLowerCase() === 'charlotte');
                        if (charlotte) {
                            setSelectedVoice(charlotte.voice_id);
                            data.properties.elevenLabsVoiceId = charlotte.voice_id;
                            data.properties.elevenLabsVoiceName = charlotte.name;
                        }
                    }
                }
            };
            const onTTSResult = (result) => {
                setTestStatus(result.success ? '✓ Sent!' : '✗ ' + (result.error || 'Failed'));
                setTimeout(() => setTestStatus(''), 3000);
            };
            const onElevenLabsResult = (result) => {
                setTestStatus(result.success ? '✓ Playing!' : '✗ ' + (result.error || 'Failed'));
                setTimeout(() => setTestStatus(''), 3000);
            };

            window.socket.off('media-players', onMediaPlayers);
            window.socket.off('tts-entities', onTtsEntities);
            window.socket.off('elevenlabs-voices', onElevenLabsVoices);
            window.socket.off('tts-result', onTTSResult);
            window.socket.off('elevenlabs-tts-result', onElevenLabsResult);

            window.socket.on('media-players', onMediaPlayers);
            window.socket.on('tts-entities', onTtsEntities);
            window.socket.on('elevenlabs-voices', onElevenLabsVoices);
            window.socket.on('tts-result', onTTSResult);
            window.socket.on('elevenlabs-tts-result', onElevenLabsResult);

            window.socket.emit('request-media-players');
            window.socket.emit('request-tts-entities');
            window.socket.emit('request-elevenlabs-voices');

            return () => {
                window.socket.off('media-players', onMediaPlayers);
                window.socket.off('tts-entities', onTtsEntities);
                window.socket.off('tts-result', onTTSResult);
                window.socket.off('elevenlabs-voices', onElevenLabsVoices);
                window.socket.off('elevenlabs-tts-result', onElevenLabsResult);
            };
        }, []);

        const handlePlayerToggle = (playerId) => {
            setSelectedPlayers(prev => {
                const isSelected = prev.includes(playerId);
                const newSelection = isSelected
                    ? prev.filter(id => id !== playerId)
                    : [...prev, playerId];
                data.properties.mediaPlayerIds = newSelection;
                
                // If deselecting a speaker, stop playback on it
                if (isSelected) {
                    console.log('[AudioOutput] Stopping playback on deselected speaker:', playerId);
                    (window.apiFetch || fetch)('/api/media/stop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entityId: playerId })
                    }).catch(err => console.error('[AudioOutput] Stop error:', err));
                }
                
                // Build speaker names map for input labels
                const speakerNames = {};
                newSelection.forEach(id => {
                    const player = mediaPlayers.find(p => (p.id?.replace('ha_', '') || p.entity_id) === id);
                    speakerNames[id] = player?.friendly_name || player?.name || id.split('.').pop();
                });
                
                // Update dynamic volume inputs
                data.updateVolumeInputs(newSelection, speakerNames);
                
                // Default new speakers to TTS enabled and fetch their volume
                if (!isSelected) {
                    setTtsEnabledSpeakers(prev => {
                        const updated = { ...prev, [playerId]: true };
                        data.properties.ttsEnabledSpeakers = updated;
                        return updated;
                    });
                    
                    // Fetch current volume from HA for this speaker
                    data.fetchSpeakerVolume(playerId).then(vol => {
                        if (vol !== null) {
                            setSpeakerVolumes(prev => ({ ...prev, [playerId]: vol }));
                        }
                    });
                    
                    // If streaming is active, start playing on this new speaker too
                    if (data.properties.isStreaming || data.properties.streamEnabled) {
                        const streamUrl = data.getStreamUrlForSpeaker(playerId);
                        console.log('[AudioOutput] Starting stream on newly selected speaker:', playerId);
                        data.playSingleSpeaker(playerId, streamUrl);
                    }
                }
                
                if (data.changeCallback) data.changeCallback();
                return newSelection;
            });
        };

        const handleTtsToggle = (playerId) => {
            setTtsEnabledSpeakers(prev => {
                const updated = { ...prev, [playerId]: !prev[playerId] };
                // If undefined (never set), it was defaulting to true, so now make it false
                if (prev[playerId] === undefined) {
                    updated[playerId] = false;
                }
                data.properties.ttsEnabledSpeakers = updated;
                return updated;
            });
        };

        const handleSpeakerStationChange = (playerId, stationIdx) => {
            const idx = parseInt(stationIdx, 10);
            console.log('[AudioOutput] Speaker', playerId, 'station changed to:', idx, '-', stations[idx]?.name);
            setSpeakerStations(prev => {
                const updated = { ...prev, [playerId]: idx };
                data.properties.speakerStations = updated;
                data.setSpeakerStation(playerId, idx);
                
                // Always switch this speaker to the new station immediately
                const streamUrl = data.getStreamUrlForSpeaker(playerId);
                console.log('[AudioOutput] Switching speaker to:', streamUrl);
                data.playSingleSpeaker(playerId, streamUrl);
                
                // Ensure streaming flags are set
                data.properties.isStreaming = true;
                data.properties.streamEnabled = true;
                setIsStreaming(true);
                setStreamEnabled(true);
                
                return updated;
            });
        };

        const handleTtsEntityChange = (e) => {
            const value = e.target.value;
            setSelectedTtsEntity(value);
            data.properties.ttsEntityId = value;
            if (data.changeCallback) data.changeCallback();
        };

        const handleMessageChange = (e) => {
            setMessage(e.target.value);
            data.properties.message = e.target.value;
        };

        const handleTtsServiceChange = (e) => {
            setTtsService(e.target.value);
            data.properties.ttsService = e.target.value;
            if (data.changeCallback) data.changeCallback();
        };

        const handleVoiceChange = (e) => {
            const voiceId = e.target.value;
            const voice = elevenLabsVoices.find(v => v.voice_id === voiceId);
            setSelectedVoice(voiceId);
            data.properties.elevenLabsVoiceId = voiceId;
            data.properties.elevenLabsVoiceName = voice?.name || '';
            if (data.changeCallback) data.changeCallback();
        };

        const handleTest = () => {
            if (selectedPlayers.length === 0) {
                setTestStatus('Select speaker(s) first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (ttsService === 'tts/speak' && !selectedTtsEntity) {
                setTestStatus('Select a TTS engine');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (ttsService === 'elevenlabs' && !selectedVoice) {
                setTestStatus('Select a voice');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (!message) {
                setTestStatus('Enter a message');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            setTestStatus('Sending...');
            
            // Get only TTS-enabled speakers
            const ttsSpeakers = selectedPlayers.filter(id => ttsEnabledSpeakers[id] !== false);
            if (ttsSpeakers.length === 0) {
                setTestStatus('No TTS-enabled speakers!');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            
            // Pause stream if playing - only on TTS-enabled speakers
            if (data.properties.isStreaming) {
                data.pauseStreamForTTS(ttsSpeakers);
            }
            
            if (window.socket) {
                if (ttsService === 'elevenlabs') {
                    window.socket.emit('request-elevenlabs-tts', {
                        message: message,
                        voiceId: selectedVoice,
                        mediaPlayerIds: ttsSpeakers
                    });
                } else {
                    ttsSpeakers.forEach(speakerId => {
                        window.socket.emit('request-tts', {
                            entityId: speakerId,
                            message: message,
                            options: {
                                tts_service: ttsService,
                                tts_entity_id: selectedTtsEntity
                            }
                        });
                    });
                }
                // Schedule resume - pass the message and TTS-enabled speakers only
                data.resumeStreamAfterTTS(message, ttsSpeakers);
            }
        };

        // Stream controls
        const handlePlayStream = async () => {
            data.properties.streamEnabled = true;
            setStreamEnabled(true);
            await data.playStream();
            setIsStreaming(true);
        };

        const handleStopStream = async () => {
            data.properties.streamEnabled = false;
            setStreamEnabled(false);
            await data.stopStream();
            setIsStreaming(false);
        };

        const handleStationChange = async (e) => {
            const idx = parseInt(e.target.value, 10);
            console.log('[AudioOutput] Global station changed to:', idx, '-', stations[idx]?.name);
            setSelectedStation(idx);
            data.properties.selectedStation = idx;
            
            // Always switch stream when user changes station (if we have speakers selected)
            const speakerIds = data.getSpeakerIds();
            if (speakerIds.length > 0) {
                console.log('[AudioOutput] Switching all speakers to new station...');
                await data.stopStream();
                await new Promise(r => setTimeout(r, 500));
                await data.playStream();
                setIsStreaming(true);
                data.properties.isStreaming = true;
                data.properties.streamEnabled = true;
                setStreamEnabled(true);
            }
        };
        
        // Apply global station to all speakers (clears per-speaker overrides)
        const handleApplyStationToAll = async () => {
            console.log('[AudioOutput] Applying station', selectedStation, 'to all speakers');
            // Clear all per-speaker station overrides
            data.properties.speakerStations = {};
            data.properties.speakerCustomUrls = {};
            setSpeakerStations({});
            
            // If streaming, restart to apply changes
            if (streamEnabled || data.properties.isStreaming) {
                await data.stopStream();
                await new Promise(r => setTimeout(r, 500));
                await data.playStream();
            }
        };

        // Handle volume change for a specific speaker with debounce
        const handleVolumeChange = (speakerId, value) => {
            const vol = parseInt(value, 10);
            
            // Update local state immediately (UI responsive)
            setSpeakerVolumes(prev => ({ ...prev, [speakerId]: vol }));
            
            // Update node properties
            data.setSpeakerVolume(speakerId, vol);
            
            // Debounce the API call - only send after user stops sliding for 300ms
            if (volumeDebounceRefs.current[speakerId]) {
                clearTimeout(volumeDebounceRefs.current[speakerId]);
            }
            
            volumeDebounceRefs.current[speakerId] = setTimeout(() => {
                // Always send volume to device - speaker might be playing even if 
                // isStreaming is false (e.g., after app restart)
                data.setVolume(speakerId, vol);
            }, 300);
        };
        
        // Get volume for a speaker (local state with fallback)
        const getSpeakerVol = (speakerId) => {
            return speakerVolumes[speakerId] ?? data.properties.speakerVolumes?.[speakerId] ?? data.properties.streamVolume ?? 50;
        };

        const handleAddStation = () => {
            setEditingStation({ name: '', url: '', isNew: true, index: stations.length });
            setShowStationEditor(true);
        };

        const handleEditStation = (idx) => {
            setEditingStation({ ...stations[idx], isNew: false, index: idx });
            setShowStationEditor(true);
        };

        const handleSaveStation = () => {
            if (!editingStation) return;
            const newStations = [...stations];
            if (editingStation.isNew) {
                newStations.push({ name: editingStation.name, url: editingStation.url });
            } else {
                newStations[editingStation.index] = { name: editingStation.name, url: editingStation.url };
            }
            setStations(newStations);
            data.properties.stations = newStations;
            setEditingStation(null);
            setShowStationEditor(false);
        };

        const handleDeleteStation = (idx) => {
            const newStations = stations.filter((_, i) => i !== idx);
            setStations(newStations);
            data.properties.stations = newStations;
            if (selectedStation >= newStations.length) {
                setSelectedStation(Math.max(0, newStations.length - 1));
                data.properties.selectedStation = Math.max(0, newStations.length - 1);
            }
        };

        // Stream discovery - search via backend proxy (avoids CORS)
        const searchStreams = async (query) => {
            if (!query || query.length < 2) {
                setStreamSearchResults([]);
                return;
            }
            
            setStreamSearchLoading(true);
            try {
                const response = await (window.apiFetch || fetch)(`/api/streams/search?q=${encodeURIComponent(query)}&limit=50`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.stations) {
                        setStreamSearchResults(data.stations);
                    } else {
                        console.error('[AudioOutput] Stream search failed:', data.error);
                        setStreamSearchResults([]);
                    }
                } else {
                    console.error('[AudioOutput] Stream search failed:', response.status);
                    setStreamSearchResults([]);
                }
            } catch (err) {
                console.error('[AudioOutput] Stream search error:', err);
                setStreamSearchResults([]);
            }
            setStreamSearchLoading(false);
        };

        // Search by genre/tag
        const searchStreamsByTag = async (tag) => {
            setStreamSearchLoading(true);
            setStreamSearch(tag);
            try {
                const response = await (window.apiFetch || fetch)(`/api/streams/search?tag=${encodeURIComponent(tag)}&limit=25`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.stations) {
                        setStreamSearchResults(data.stations);
                    }
                }
            } catch (err) {
                console.error('[AudioOutput] Stream tag search error:', err);
            }
            setStreamSearchLoading(false);
        };

        // Fetch all SomaFM channels directly from their API
        const fetchSomaFM = async () => {
            setStreamSearchLoading(true);
            setStreamSearch('SomaFM');
            try {
                const response = await (window.apiFetch || fetch)('/api/streams/somafm');
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.stations) {
                        setStreamSearchResults(data.stations);
                    }
                }
            } catch (err) {
                console.error('[AudioOutput] SomaFM fetch error:', err);
            }
            setStreamSearchLoading(false);
        };

        // Load curated nature/ambient sound stations (all Apple-compatible MP3)
        const fetchNatureSounds = () => {
            setStreamSearch('Nature Sounds');
            setStreamSearchResults([
                { name: 'NATURE RADIO SLEEP', url: 'https://az1.mediacp.eu/listen/natureradiosleep/radio.mp3', codec: 'MP3', bitrate: 128 },
                { name: 'MyNoise Pure Nature', url: 'https://purenature-mynoise.radioca.st/stream', codec: 'MP3', bitrate: 128 },
                { name: 'Ambi Nature Radio', url: 'https://nature-rex.radioca.st/stream', codec: 'MP3', bitrate: 128 },
                { name: 'Nature Radio Rain', url: 'https://maggie.torontocast.com:2020/stream/natureradiorain', codec: 'MP3', bitrate: 128 },
                { name: 'Epic Lounge - Nature Sounds', url: 'https://stream.epic-lounge.com/nature-sounds', codec: 'MP3', bitrate: 192 },
                { name: 'Radio Art - Nature', url: 'http://air.radioart.com/fNature.mp3', codec: 'MP3', bitrate: 128 }
            ]);
        };

        // Add or remove stream from search results to/from station list
        const handleToggleStreamFromSearch = (stream) => {
            const existingIndex = stations.findIndex(s => s.url === stream.url);
            
            if (existingIndex >= 0) {
                // Already in list - remove it
                console.log(`[AudioOutput] ➖ Removing station: ${stream.name}`);
                const newStations = stations.filter((_, i) => i !== existingIndex);
                setStations(newStations);
                data.properties.stations = newStations;
                // Update selected station index if needed
                if (selectedStation >= newStations.length) {
                    setSelectedStation(Math.max(0, newStations.length - 1));
                    data.properties.selectedStation = Math.max(0, newStations.length - 1);
                }
                // Update UI to show removed
                setStreamSearchResults(prev => prev.map(s => 
                    s.url === stream.url ? { ...s, added: false } : s
                ));
            } else {
                // Not in list - add it
                console.log(`[AudioOutput] ➕ Adding station: ${stream.name}`);
                console.log(`[AudioOutput]    URL: ${stream.url}`);
                console.log(`[AudioOutput]    Codec: ${stream.codec || 'unknown'}, Bitrate: ${stream.bitrate || 'unknown'}`);
                
                // Warn about potentially problematic formats
                const codec = (stream.codec || '').toUpperCase();
                if (codec.includes('OGG') || codec.includes('VORBIS') || codec.includes('OPUS')) {
                    console.warn(`[AudioOutput] ⚠️ Codec "${stream.codec}" may not be supported by Apple devices (HomePod, AirPlay)`);
                }
                if (stream.url?.endsWith('.m3u') || stream.url?.endsWith('.pls')) {
                    console.warn(`[AudioOutput] ⚠️ URL is a playlist file, not a direct stream. May not work with all players.`);
                }
                
                const newStations = [...stations, { name: stream.name, url: stream.url }];
                setStations(newStations);
                data.properties.stations = newStations;
                // Update UI to show added
                setStreamSearchResults(prev => prev.map(s => 
                    s.url === stream.url ? { ...s, added: true } : s
                ));
            }
        };

        // Render sockets
        const renderInputs = () => {
            return Object.entries(data.inputs || {}).map(([key, input]) => {
                const socket = input.socket;
                return React.createElement('div', {
                    key: `input-${key}`,
                    style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement(window.RefComponent, {
                        key: 'ref',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: socket } }),
                        unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { fontSize: '12px', color: '#c5cdd3' } }, input.label || key)
                ]);
            });
        };

        const renderOutputs = () => {
            return Object.entries(data.outputs || {}).map(([key, output]) => {
                const socket = output.socket;
                return React.createElement('div', {
                    key: `output-${key}`,
                    style: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginBottom: '4px' }
                }, [
                    React.createElement('span', { key: 'label', style: { fontSize: '12px', color: '#c5cdd3' } }, output.label || key),
                    React.createElement(window.RefComponent, {
                        key: 'ref',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: socket } }),
                        unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                    })
                ]);
            });
        };

        // Resize handler
        const handleResizeStart = (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = nodeWidth;
            const startHeight = nodeHeight || target.closest('[data-testid="audio-output-node"]')?.offsetHeight || 400;
            const pointerId = e.pointerId;

            // Get zoom scale from parent transform
            const getScale = () => {
                let el = target;
                while (el && el !== document.body) {
                    const transform = window.getComputedStyle(el).transform;
                    if (transform && transform !== 'none') {
                        const matrix = new DOMMatrix(transform);
                        if (matrix.a !== 1) return matrix.a;
                    }
                    el = el.parentElement;
                }
                return 1;
            };
            const scale = getScale();

            const handleMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                moveEvent.preventDefault();
                moveEvent.stopPropagation();

                const deltaX = (moveEvent.clientX - startX) / scale;
                const deltaY = (moveEvent.clientY - startY) / scale;

                const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
                const newHeight = Math.max(200, Math.min(800, startHeight + deltaY));

                setNodeWidth(newWidth);
                setNodeHeight(newHeight);
                data.properties.nodeWidth = newWidth;
                data.properties.nodeHeight = newHeight;
            };

            const handleUp = (upEvent) => {
                if (upEvent.pointerId !== pointerId) return;
                target.releasePointerCapture(pointerId);
                target.removeEventListener('pointermove', handleMove);
                target.removeEventListener('pointerup', handleUp);
                target.removeEventListener('pointercancel', handleUp);
                if (data.changeCallback) data.changeCallback();
            };

            target.addEventListener('pointermove', handleMove);
            target.addEventListener('pointerup', handleUp);
            target.addEventListener('pointercancel', handleUp);
        };

        // Styles
        const nodeStyle = {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #00d9ff',
            borderRadius: '12px',
            padding: '12px',
            width: nodeWidth + 'px',
            minWidth: '280px',
            maxWidth: '600px',
            minHeight: nodeHeight ? nodeHeight + 'px' : 'auto',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            position: 'relative'
        };

        const sectionHeaderStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            cursor: 'pointer',
            borderBottom: '1px solid #333'
        };

        // Get shared theme for consistent styling
        const THEME = window.T2Controls?.THEME || {
            surface: '#1e2530',
            text: '#e0e0e0',
            textMuted: '#888',
            border: 'rgba(95, 179, 179, 0.3)',
            primary: '#5fb3b3'
        };

        const selectStyle = {
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: `1px solid ${THEME.border}`,
            background: THEME.surface,
            color: THEME.text,
            fontSize: '12px',
            outline: 'none'
        };

        const inputStyle = {
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: `1px solid ${THEME.border}`,
            background: THEME.surface,
            color: THEME.text,
            fontSize: '12px',
            boxSizing: 'border-box',
            outline: 'none'
        };

        const buttonStyle = {
            padding: '6px 12px',
            borderRadius: '4px',
            border: 'none',
            background: `linear-gradient(135deg, ${THEME.primary} 0%, #0099cc 100%)`,
            color: '#000',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '12px'
        };

        const labelStyle = {
            fontSize: '10px',
            color: THEME.textMuted,
            marginBottom: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
        };

        return React.createElement('div', { style: nodeStyle, 'data-testid': 'audio-output-node' }, [
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                key: 'header',
                icon: '🔊',
                title: 'Audio Output',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: isStreaming ? '#4caf50' : (selectedPlayers.length > 0 ? '#888' : '#f44336')
            }) : React.createElement('div', {
                key: 'header',
                style: { fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }
            }, '🔊 Audio Output'),

            // === AUTOMATION IO SECTION (Collapsible) ===
            React.createElement('div', { key: 'io-section', style: { marginBottom: '8px', border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' } }, [
                React.createElement('div', {
                    key: 'io-header',
                    onClick: () => {
                        const newVal = !showIOSection;
                        setShowIOSection(newVal);
                        data.properties.showIOSection = newVal;
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { ...sectionHeaderStyle, padding: '6px 8px', background: '#16213e' }
                }, [
                    React.createElement('span', { key: 'title', style: { fontSize: '11px', fontWeight: '600' } }, 
                        `⚡ Automation (${Object.keys(data.inputs || {}).length} in / ${Object.keys(data.outputs || {}).length} out)`
                    ),
                    React.createElement('span', { key: 'arrow', style: { fontSize: '10px' } }, showIOSection ? '▼' : '▶')
                ]),
                showIOSection && React.createElement('div', { 
                    key: 'io-content', 
                    style: { padding: '8px', display: 'flex', justifyContent: 'space-between' } 
                }, [
                    React.createElement('div', { key: 'inputs', style: { display: 'flex', flexDirection: 'column' } }, renderInputs()),
                    React.createElement('div', { key: 'outputs', style: { display: 'flex', flexDirection: 'column' } }, renderOutputs())
                ])
            ]),

            // === SPEAKERS SECTION (Collapsible) ===
            React.createElement('div', { key: 'speaker-section', style: { marginBottom: '8px', border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' } }, [
                React.createElement('div', {
                    key: 'speaker-header',
                    onClick: () => {
                        const newVal = !showSpeakersSection;
                        setShowSpeakersSection(newVal);
                        data.properties.showSpeakersSection = newVal;
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { ...sectionHeaderStyle, padding: '6px 8px', background: '#16213e' }
                }, [
                    React.createElement('span', { key: 'title', style: { fontSize: '11px', fontWeight: '600' } }, 
                        `🔈 Speakers (${selectedPlayers.length})`
                    ),
                    React.createElement('span', { key: 'arrow', style: { fontSize: '10px' } }, showSpeakersSection ? '▼' : '▶')
                ]),
                showSpeakersSection && React.createElement('div', { key: 'speaker-content', style: { padding: '8px' } }, [
                    // Speaker dropdown button
                    React.createElement('button', {
                        key: 'toggle-btn',
                        onClick: () => setShowSpeakerList(!showSpeakerList),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { ...selectStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
                    }, [
                        React.createElement('span', { key: 'text' },
                            selectedPlayers.length === 0 ? '-- Select Speakers --' :
                            selectedPlayers.length === 1 ? mediaPlayers.find(p => (p.id?.replace('ha_', '') || p.entity_id) === selectedPlayers[0])?.name || selectedPlayers[0] :
                            `${selectedPlayers.length} speakers selected`
                        ),
                        React.createElement('span', { key: 'arrow' }, showSpeakerList ? '▲' : '▼')
                    ]),
                    // Speaker list dropdown
                    showSpeakerList && React.createElement('div', {
                    key: 'speaker-list',
                    onWheel: (e) => e.stopPropagation(),
                    style: { maxHeight: '150px', overflowY: 'auto', background: '#1a1a2e', border: '1px solid #444', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '4px' }
                }, [
                    // Header row
                    React.createElement('div', {
                        key: 'header',
                        style: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderBottom: '1px solid #333', marginBottom: '2px', fontSize: '8px', color: '#888' }
                    }, [
                        React.createElement('span', { key: 'sel', style: { width: '16px' } }, ''),
                        React.createElement('span', { key: 'name', style: { flex: 1 } }, 'Speaker'),
                        React.createElement('span', { key: 'station', style: { width: '70px', textAlign: 'center' }, title: 'Station for this speaker' }, 'Station'),
                        React.createElement('span', { key: 'tts', style: { width: '30px', textAlign: 'center' }, title: 'Enable TTS announcements for this speaker' }, 'TTS')
                    ]),
                    // Speaker rows
                    ...mediaPlayers.map(p => {
                        const id = p.id?.replace('ha_', '') || p.entity_id;
                        const name = p.name || p.friendly_name || id;
                        const isChecked = selectedPlayers.includes(id);
                        const isTtsEnabled = ttsEnabledSpeakers[id] !== false; // Default to true
                        const speakerStation = speakerStations[id] ?? selectedStation; // Default to global station
                        return React.createElement('div', {
                            key: id,
                            style: { display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', borderRadius: '4px', background: isChecked ? 'rgba(0, 217, 255, 0.15)' : 'transparent' }
                        }, [
                            React.createElement('input', { 
                                key: 'cb', 
                                type: 'checkbox', 
                                checked: isChecked, 
                                onChange: () => handlePlayerToggle(id), 
                                onPointerDown: (e) => e.stopPropagation(),
                                style: { accentColor: '#00d9ff', cursor: 'pointer' } 
                            }),
                            React.createElement('span', { 
                                key: 'name', 
                                style: { fontSize: '10px', flex: 1, cursor: 'pointer' },
                                onClick: () => handlePlayerToggle(id)
                            }, name),
                            // Station dropdown - only show if speaker is selected
                            isChecked && React.createElement('select', {
                                key: 'station',
                                value: speakerStation,
                                onChange: (e) => handleSpeakerStationChange(id, e.target.value),
                                onPointerDown: (e) => e.stopPropagation(),
                                title: `Station for ${name}`,
                                style: { 
                                    width: '70px', 
                                    fontSize: '8px', 
                                    padding: '2px', 
                                    background: '#222', 
                                    color: '#ddd', 
                                    border: '1px solid #444', 
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }
                            }, stations.map((s, i) => React.createElement('option', { key: i, value: i }, s.name))),
                            // TTS checkbox - only show if speaker is selected
                            isChecked && React.createElement('input', {
                                key: 'tts',
                                type: 'checkbox',
                                checked: isTtsEnabled,
                                onChange: () => handleTtsToggle(id),
                                onPointerDown: (e) => e.stopPropagation(),
                                style: { accentColor: '#ffa726', cursor: 'pointer', width: '30px' },
                                title: isTtsEnabled ? 'TTS enabled - will receive announcements' : 'TTS disabled - no announcements'
                            })
                        ]);
                    })
                ])
                ]) // End speaker-content
            ]),

            // === STREAMING SECTION ===
            React.createElement('div', { key: 'stream-section', style: { marginBottom: '8px', border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' } }, [
                // Section header
                React.createElement('div', {
                    key: 'stream-header',
                    onClick: () => {
                        const newVal = !showStreamSection;
                        setShowStreamSection(newVal);
                        data.properties.showStreamSection = newVal;
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { ...sectionHeaderStyle, padding: '6px 8px', background: '#16213e' }
                }, [
                    React.createElement('span', { key: 'title', style: { fontSize: '11px', fontWeight: '600' } }, '📻 Background Stream'),
                    React.createElement('span', { key: 'arrow', style: { fontSize: '10px' } }, showStreamSection ? '▼' : '▶')
                ]),
                
                // Stream content
                showStreamSection && React.createElement('div', { key: 'stream-content', style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                    // Station dropdown + remove/add/apply-all buttons
                    React.createElement('div', { key: 'station-row', style: { display: 'flex', gap: '4px' } }, [
                        React.createElement('select', {
                            key: 'station-select',
                            value: selectedStation,
                            onChange: handleStationChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...selectStyle, flex: 1 }
                        }, stations.map((s, i) => React.createElement('option', { key: i, value: i }, s.name))),
                        // Apply to All button - clears per-speaker overrides
                        React.createElement('button', {
                            key: 'apply-all-btn',
                            onClick: handleApplyStationToAll,
                            onPointerDown: (e) => e.stopPropagation(),
                            title: Object.keys(speakerStations).length > 0 
                                ? `Apply "${stations[selectedStation]?.name}" to all speakers (${Object.keys(speakerStations).length} have custom stations)` 
                                : 'All speakers already using this station',
                            style: { 
                                ...buttonStyle, 
                                padding: '4px 6px',
                                fontSize: '9px',
                                background: Object.keys(speakerStations).length > 0 ? '#ff9800' : '#555',
                                cursor: Object.keys(speakerStations).length > 0 ? 'pointer' : 'default'
                            }
                        }, '⟲ All'),
                        // Remove current station button
                        React.createElement('button', {
                            key: 'remove-btn',
                            onClick: () => {
                                if (stations.length <= 1) return; // Keep at least one station
                                const newStations = stations.filter((_, i) => i !== selectedStation);
                                setStations(newStations);
                                data.properties.stations = newStations;
                                const newIdx = Math.min(selectedStation, newStations.length - 1);
                                setSelectedStation(newIdx);
                                data.properties.selectedStation = newIdx;
                            },
                            onPointerDown: (e) => e.stopPropagation(),
                            disabled: stations.length <= 1,
                            title: stations.length <= 1 ? 'Cannot remove last station' : 'Remove current station',
                            style: { 
                                ...buttonStyle, 
                                padding: '4px 8px',
                                background: stations.length <= 1 ? '#444' : '#e53935',
                                cursor: stations.length <= 1 ? 'not-allowed' : 'pointer'
                            }
                        }, '🗑'),
                        // Add new station button
                        React.createElement('button', {
                            key: 'add-btn',
                            onClick: handleAddStation,
                            onPointerDown: (e) => e.stopPropagation(),
                            title: 'Add new station',
                            style: { ...buttonStyle, padding: '4px 8px' }
                        }, '+')
                    ]),

                    // Custom URL input
                    React.createElement('input', {
                        key: 'custom-url',
                        type: 'text',
                        value: customStreamUrl,
                        onChange: (e) => { setCustomStreamUrl(e.target.value); data.properties.customStreamUrl = e.target.value; },
                        onPointerDown: (e) => e.stopPropagation(),
                        placeholder: 'Custom stream URL (overrides station)',
                        style: inputStyle
                    }),

                    // Link Volumes checkbox
                    React.createElement('label', {
                        key: 'link-volumes',
                        style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '10px', color: '#aaa' },
                        onPointerDown: (e) => e.stopPropagation()
                    }, [
                        React.createElement('input', {
                            key: 'cb',
                            type: 'checkbox',
                            checked: linkVolumes,
                            onChange: (e) => {
                                const newVal = e.target.checked;
                                setLinkVolumes(newVal);
                                data.properties.linkVolumes = newVal;
                            },
                            style: { accentColor: '#00d9ff', cursor: 'pointer' }
                        }),
                        React.createElement('span', { key: 'label' }, '🔗 Link Volumes (master slider)')
                    ]),

                    // Master Volume slider - only shown when linkVolumes is enabled
                    linkVolumes && React.createElement('div', { key: 'volume-row', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                        React.createElement('span', { key: 'label', style: { fontSize: '10px', color: '#888' } }, 'Vol'),
                        React.createElement('input', {
                            key: 'slider',
                            type: 'range',
                            min: 0,
                            max: 100,
                            value: getSpeakerVol(selectedPlayers[0] || 'default'),
                            onChange: (e) => {
                                // Apply to all speakers when using the main slider
                                selectedPlayers.forEach(sp => handleVolumeChange(sp, e.target.value));
                            },
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { flex: 1 }
                        }),
                        React.createElement('span', { key: 'value', style: { fontSize: '10px', width: '28px' } }, 
                            `${getSpeakerVol(selectedPlayers[0] || 'default')}%`)
                    ]),
                    
                    // Per-speaker volume sliders (show when speakers selected and linkVolumes is off)
                    (selectedPlayers.length > 0 && !linkVolumes) && React.createElement('div', { 
                        key: 'per-speaker-volumes',
                        style: { 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '4px',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '6px',
                            borderRadius: '4px',
                            marginTop: '4px'
                        }
                    }, [
                        React.createElement('span', { 
                            key: 'header', 
                            style: { fontSize: '9px', color: '#888', marginBottom: '2px' } 
                        }, `Speaker Volumes (${selectedPlayers.length}):`),
                        ...selectedPlayers.map(sp => {
                            const speakerName = mediaPlayers.find(p => p.entity_id === sp)?.friendly_name || sp.split('.').pop();
                            const vol = getSpeakerVol(sp);
                            return React.createElement('div', { 
                                key: sp, 
                                style: { display: 'flex', alignItems: 'center', gap: '4px' } 
                            }, [
                                React.createElement('span', { 
                                    key: 'name', 
                                    style: { fontSize: '9px', color: '#aaa', width: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                                    title: speakerName
                                }, speakerName),
                                React.createElement('input', {
                                    key: 'slider',
                                    type: 'range',
                                    min: 0,
                                    max: 100,
                                    value: vol,
                                    onChange: (e) => handleVolumeChange(sp, e.target.value),
                                    onPointerDown: (e) => e.stopPropagation(),
                                    style: { flex: 1, height: '12px' }
                                }),
                                React.createElement('span', { 
                                    key: 'value', 
                                    style: { fontSize: '9px', width: '28px', textAlign: 'right' } 
                                }, `${vol}%`)
                            ]);
                        })
                    ]),

                    // Play/Stop buttons
                    React.createElement('div', { key: 'stream-buttons', style: { display: 'flex', gap: '6px' } }, [
                        React.createElement('button', {
                            key: 'play',
                            onClick: handlePlayStream,
                            onPointerDown: (e) => e.stopPropagation(),
                            disabled: selectedPlayers.length === 0,
                            style: { ...buttonStyle, flex: 1, background: isStreaming ? '#4caf50' : buttonStyle.background }
                        }, isStreaming ? '▶️ Playing' : '▶️ Play'),
                        React.createElement('button', {
                            key: 'stop',
                            onClick: handleStopStream,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...buttonStyle, flex: 1, background: '#f44336' }
                        }, '⏹️ Stop')
                    ])
                ])
            ]),

            // === TTS SECTION ===
            React.createElement('div', { key: 'tts-section', style: { border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' } }, [
                // Section header
                React.createElement('div', {
                    key: 'tts-header',
                    onClick: () => {
                        const newVal = !showTTSSection;
                        setShowTTSSection(newVal);
                        data.properties.showTTSSection = newVal;
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { ...sectionHeaderStyle, padding: '6px 8px', background: '#16213e' }
                }, [
                    React.createElement('span', { key: 'title', style: { fontSize: '11px', fontWeight: '600' } }, '📢 TTS Announcements'),
                    React.createElement('span', { key: 'arrow', style: { fontSize: '10px' } }, showTTSSection ? '▼' : '▶')
                ]),

                // TTS content
                showTTSSection && React.createElement('div', { key: 'tts-content', style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                    // TTS Service
                    React.createElement('div', { key: 'service-row' }, [
                        React.createElement('div', { key: 'label', style: labelStyle }, 'TTS Service'),
                        React.createElement('select', {
                            key: 'service-select',
                            value: ttsService,
                            onChange: handleTtsServiceChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: selectStyle
                        }, [
                            React.createElement('option', { key: 'tts/speak', value: 'tts/speak' }, 'tts.speak'),
                            React.createElement('option', { key: 'tts/cloud_say', value: 'tts/cloud_say' }, 'tts.cloud_say'),
                            React.createElement('option', { key: 'tts/google_translate_say', value: 'tts/google_translate_say' }, 'tts.google_translate_say'),
                            React.createElement('option', { key: 'elevenlabs', value: 'elevenlabs' }, '🎙️ ElevenLabs')
                        ])
                    ]),

                    // ElevenLabs Voice (conditional)
                    ttsService === 'elevenlabs' && React.createElement('div', { key: 'voice-row' }, [
                        React.createElement('div', { key: 'label', style: labelStyle }, 'Voice'),
                        React.createElement('select', {
                            key: 'voice-select',
                            value: selectedVoice,
                            onChange: handleVoiceChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: selectStyle
                        }, [
                            React.createElement('option', { key: 'empty', value: '' }, elevenLabsVoices.length ? '-- Select Voice --' : 'No API key'),
                            ...elevenLabsVoices.map(v => React.createElement('option', { key: v.voice_id, value: v.voice_id }, v.name))
                        ])
                    ]),

                    // TTS Entity (conditional)
                    ttsService === 'tts/speak' && React.createElement('div', { key: 'entity-row' }, [
                        React.createElement('div', { key: 'label', style: labelStyle }, 'TTS Engine'),
                        React.createElement('select', {
                            key: 'entity-select',
                            value: selectedTtsEntity,
                            onChange: handleTtsEntityChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: selectStyle
                        }, [
                            React.createElement('option', { key: 'empty', value: '' }, '-- Select TTS Engine --'),
                            ...ttsEntities.map(e => React.createElement('option', { key: e.entity_id, value: e.entity_id }, e.friendly_name || e.entity_id))
                        ])
                    ]),

                    // Message input
                    React.createElement('div', { key: 'message-row' }, [
                        React.createElement('div', { key: 'label', style: labelStyle }, 'Message'),
                        React.createElement('input', {
                            key: 'input',
                            type: 'text',
                            value: message,
                            onChange: handleMessageChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            placeholder: 'Enter message to speak...',
                            style: inputStyle
                        })
                    ]),

                    // Test button
                    React.createElement('div', { key: 'test-row', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                        React.createElement('button', {
                            key: 'btn',
                            onClick: handleTest,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: buttonStyle
                        }, '🔊 Test TTS'),
                        testStatus && React.createElement('span', {
                            key: 'status',
                            style: { fontSize: '10px', color: testStatus.includes('✓') ? '#4caf50' : '#ff9800' }
                        }, testStatus)
                    ])
                ])
            ]),

            // Station editor modal - enhanced with stream discovery
            showStationEditor && React.createElement('div', {
                key: 'station-modal',
                style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', padding: '12px', zIndex: 100, borderRadius: '10px' }
            }, [
                // Modal header with tabs
                React.createElement('div', { key: 'header', style: { marginBottom: '10px' } }, [
                    React.createElement('div', { key: 'title', style: { fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' } }, 
                        editingStation?.isNew ? '➕ Add Station' : '✏️ Edit Station'
                    ),
                    // Tab buttons (only show for new stations)
                    editingStation?.isNew && React.createElement('div', { key: 'tabs', style: { display: 'flex', gap: '4px' } }, [
                        React.createElement('button', {
                            key: 'manual-tab',
                            onClick: () => setStationEditorMode('manual'),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { 
                                ...buttonStyle, 
                                flex: 1, 
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: stationEditorMode === 'manual' ? buttonStyle.background : '#444'
                            }
                        }, '✏️ Manual'),
                        React.createElement('button', {
                            key: 'browse-tab',
                            onClick: () => setStationEditorMode('browse'),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { 
                                ...buttonStyle, 
                                flex: 1, 
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: stationEditorMode === 'browse' ? buttonStyle.background : '#444'
                            }
                        }, '🔍 Browse Streams')
                    ])
                ]),

                // Manual mode - name & URL inputs
                (stationEditorMode === 'manual' || !editingStation?.isNew) && React.createElement('div', { key: 'manual-content', style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 } }, [
                    React.createElement('input', {
                        key: 'name',
                        type: 'text',
                        value: editingStation?.name || '',
                        onChange: (e) => setEditingStation({ ...editingStation, name: e.target.value }),
                        onPointerDown: (e) => e.stopPropagation(),
                        placeholder: 'Station name',
                        style: inputStyle
                    }),
                    React.createElement('input', {
                        key: 'url',
                        type: 'text',
                        value: editingStation?.url || '',
                        onChange: (e) => setEditingStation({ ...editingStation, url: e.target.value }),
                        onPointerDown: (e) => e.stopPropagation(),
                        placeholder: 'Stream URL (http://...)',
                        style: inputStyle
                    }),
                    React.createElement('div', { key: 'buttons', style: { display: 'flex', gap: '8px', marginTop: 'auto' } }, [
                        React.createElement('button', {
                            key: 'save',
                            onClick: handleSaveStation,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...buttonStyle, flex: 1 }
                        }, 'Save'),
                        React.createElement('button', {
                            key: 'cancel',
                            onClick: () => { setEditingStation(null); setShowStationEditor(false); setStationEditorMode('manual'); setStreamSearchResults([]); },
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...buttonStyle, flex: 1, background: '#666' }
                        }, 'Cancel')
                    ])
                ]),

                // Browse mode - search and results
                stationEditorMode === 'browse' && editingStation?.isNew && React.createElement('div', { key: 'browse-content', style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' } }, [
                    // Search input
                    React.createElement('div', { key: 'search-row', style: { display: 'flex', gap: '4px' } }, [
                        React.createElement('input', {
                            key: 'search',
                            type: 'text',
                            value: streamSearch,
                            onChange: (e) => setStreamSearch(e.target.value),
                            onKeyDown: (e) => { if (e.key === 'Enter') searchStreams(streamSearch); },
                            onPointerDown: (e) => e.stopPropagation(),
                            placeholder: 'Search stations...',
                            style: { ...inputStyle, flex: 1 }
                        }),
                        React.createElement('button', {
                            key: 'search-btn',
                            onClick: () => searchStreams(streamSearch),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...buttonStyle, padding: '6px 10px' }
                        }, '🔍')
                    ]),
                    
                    // Genre quick buttons
                    React.createElement('div', { key: 'genres', style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } }, [
                        // SomaFM special button (fetches all their channels)
                        React.createElement('button', {
                            key: 'somafm',
                            onClick: fetchSomaFM,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { 
                                padding: '3px 8px', 
                                borderRadius: '12px', 
                                border: 'none', 
                                background: streamSearch === 'SomaFM' ? '#ff6b35' : 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)', 
                                color: '#fff',
                                fontSize: '9px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            },
                            title: 'Load all SomaFM channels (~30 stations)'
                        }, '📻 SomaFM'),
                        // Nature Sounds special button
                        React.createElement('button', {
                            key: 'nature',
                            onClick: fetchNatureSounds,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { 
                                padding: '3px 8px', 
                                borderRadius: '12px', 
                                border: 'none', 
                                background: streamSearch === 'Nature Sounds' ? '#2e7d32' : 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)', 
                                color: '#fff',
                                fontSize: '9px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            },
                            title: 'Ambient nature sounds for sleep (crickets, rain, forest)'
                        }, '🌲 Nature'),
                        // Regular genre buttons
                        ...streamGenres.map(genre => React.createElement('button', {
                            key: genre,
                            onClick: () => searchStreamsByTag(genre),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { 
                                padding: '3px 8px', 
                                borderRadius: '12px', 
                                border: 'none', 
                                background: streamSearch === genre ? '#00d9ff' : '#333', 
                                color: streamSearch === genre ? '#000' : '#fff',
                                fontSize: '9px',
                                cursor: 'pointer'
                            }
                        }, genre))
                    ]),

                    // Results list
                    React.createElement('div', { 
                        key: 'results', 
                        onWheel: (e) => e.stopPropagation(),
                        style: { 
                            flex: 1, 
                            overflowY: 'auto', 
                            background: '#111', 
                            borderRadius: '6px', 
                            padding: '6px',
                            minHeight: '120px'
                        } 
                    }, [
                        streamSearchLoading && React.createElement('div', { key: 'loading', style: { textAlign: 'center', padding: '20px', color: '#888' } }, '🔄 Searching...'),
                        
                        !streamSearchLoading && streamSearchResults.length === 0 && React.createElement('div', { 
                            key: 'empty', 
                            style: { textAlign: 'center', padding: '20px', color: '#666', fontSize: '11px' } 
                        }, streamSearch ? 'No stations found. Try a different search.' : 'Search for stations or click a genre above.'),
                        
                        ...streamSearchResults.map((stream, idx) => React.createElement('div', {
                            key: idx,
                            style: { 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '6px', 
                                borderBottom: '1px solid #222',
                                background: stream.added ? 'rgba(76, 175, 80, 0.2)' : 'transparent'
                            }
                        }, [
                            // Station info
                            React.createElement('div', { key: 'info', style: { flex: 1, overflow: 'hidden' } }, [
                                React.createElement('div', { 
                                    key: 'name', 
                                    style: { fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                                    title: stream.name
                                }, stream.name),
                                React.createElement('div', { 
                                    key: 'meta', 
                                    style: { fontSize: '9px', color: '#888' } 
                                }, `${stream.country || '?'} • ${stream.codec} ${stream.bitrate ? stream.bitrate + 'kbps' : ''}`)
                            ]),
                            // Add/Remove button (toggle)
                            React.createElement('button', {
                                key: 'add',
                                onClick: () => handleToggleStreamFromSearch(stream),
                                onPointerDown: (e) => e.stopPropagation(),
                                style: { 
                                    ...buttonStyle, 
                                    padding: '4px 10px', 
                                    fontSize: '10px',
                                    background: stream.added ? '#4caf50' : buttonStyle.background
                                },
                                title: stream.added ? 'Click to remove from your stations' : 'Click to add to your stations'
                            }, stream.added ? '✓' : '+')
                        ]))
                    ]),

                    // Close button
                    React.createElement('button', {
                        key: 'close',
                        onClick: () => { setEditingStation(null); setShowStationEditor(false); setStationEditorMode('manual'); setStreamSearchResults([]); setStreamSearch(''); },
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { ...buttonStyle, background: '#666' }
                    }, 'Done')
                ])
            ]),

            // Resize handle (bottom-right corner)
            React.createElement('div', {
                key: 'resize-handle',
                style: {
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    width: '16px',
                    height: '16px',
                    cursor: 'nwse-resize',
                    opacity: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: '#00d9ff',
                    userSelect: 'none'
                },
                onPointerDown: handleResizeStart,
                title: 'Drag to resize node'
            }, '⤡')
        ]);
    }

    // Register - keep old name for backwards compatibility
    if (window.nodeRegistry) {
        window.nodeRegistry.register('TTSAnnouncementNode', {
            label: 'Audio Output',
            category: 'Media',
            nodeClass: TTSAnnouncementNode,
            component: TTSAnnouncementComponent,
            factory: (cb) => new TTSAnnouncementNode(cb)
        });
        console.log('[Plugins] TTSAnnouncementNode (Audio Output) registered');
    }
})();
