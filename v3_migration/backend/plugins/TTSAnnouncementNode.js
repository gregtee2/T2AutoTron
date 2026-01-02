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
                message: 'Hello, this is a test announcement',
                ttsService: 'tts/speak',
                ttsEntityId: '',
                elevenLabsVoiceId: '',
                elevenLabsVoiceName: '',
                lastResult: null,
                
                // Streaming properties
                stations: [...DEFAULT_STATIONS],
                selectedStation: 0,
                customStreamUrl: '',
                streamVolume: 50,
                isStreaming: false,
                streamEnabled: false,  // Master toggle
                
                // Pause/resume coordination
                resumeDelay: 5000,  // ms to wait after TTS before resuming stream (5 sec default)
                wasStreamingBeforeTTS: false
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addInput('message', new ClassicPreset.Input(sockets.any, 'Message'));
            this.addInput('streamUrl', new ClassicPreset.Input(sockets.any, 'Stream URL'));

            // Outputs
            this.addOutput('success', new ClassicPreset.Output(sockets.boolean, 'Success'));
            this.addOutput('streaming', new ClassicPreset.Output(sockets.boolean, 'Streaming'));

            // Track last trigger for edge detection
            this._lastTrigger = false;
            this._lastSentTime = 0;
            this._resumeTimeout = null;
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

        async playStream() {
            const speakerIds = this.getSpeakerIds();
            const streamUrl = this.getStreamUrl();

            if (!streamUrl || speakerIds.length === 0) {
                console.warn('[AudioOutput] No stream URL or speaker selected');
                return false;
            }

            console.log(`[AudioOutput] ▶️ Playing stream on ${speakerIds.length} speaker(s):`, speakerIds);

            try {
                // Play on all selected speakers - use Promise.all for parallel execution
                const playPromises = speakerIds.map(async (speaker) => {
                    try {
                        const response = await (window.apiFetch || fetch)('/api/media/play', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                entityId: speaker,
                                mediaUrl: streamUrl,
                                mediaType: 'music',
                                volume: this.properties.streamVolume / 100
                            })
                        });
                        if (response.ok) {
                            console.log(`[AudioOutput] ✓ Stream started on ${speaker}`);
                        } else {
                            console.warn(`[AudioOutput] ✗ Failed to start stream on ${speaker}: ${response.status}`);
                        }
                        return response.ok;
                    } catch (err) {
                        console.error(`[AudioOutput] ✗ Error starting stream on ${speaker}:`, err);
                        return false;
                    }
                });

                const results = await Promise.all(playPromises);
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

        async stopStream() {
            const speakerIds = this.getSpeakerIds();
            if (speakerIds.length === 0) return;

            console.log(`[AudioOutput] ⏹️ Stopping stream on ${speakerIds.length} speaker(s):`, speakerIds);

            try {
                // Stop on all speakers in parallel
                const stopPromises = speakerIds.map(async (speaker) => {
                    try {
                        const response = await (window.apiFetch || fetch)('/api/media/stop', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ entityId: speaker })
                        });
                        if (response.ok) {
                            console.log(`[AudioOutput] ✓ Stopped ${speaker}`);
                        }
                        return response.ok;
                    } catch (err) {
                        console.error(`[AudioOutput] ✗ Error stopping ${speaker}:`, err);
                        return false;
                    }
                });

                await Promise.all(stopPromises);
                this.properties.isStreaming = false;
                if (this.changeCallback) this.changeCallback();
            } catch (err) {
                console.error('[AudioOutput] Stop error:', err);
            }
        }

        async pauseStreamForTTS() {
            if (this.properties.isStreaming) {
                console.log(`[AudioOutput] ⏸️ Pausing stream for TTS (will resume in ${this.properties.resumeDelay}ms)`);
                this.properties.wasStreamingBeforeTTS = true;
                await this.stopStream();
            }
        }

        async resumeStreamAfterTTS() {
            // Clear any pending resume
            if (this._resumeTimeout) {
                clearTimeout(this._resumeTimeout);
            }
            
            const speakerIds = this.getSpeakerIds();
            console.log(`[AudioOutput] 📢 TTS sent. Scheduling stream resume in ${this.properties.resumeDelay}ms for ${speakerIds.length} speaker(s)`);
            
            // Wait for TTS to finish, then resume
            this._resumeTimeout = setTimeout(async () => {
                console.log(`[AudioOutput] ⏰ Resume timer fired. wasStreaming=${this.properties.wasStreamingBeforeTTS}, streamEnabled=${this.properties.streamEnabled}`);
                if (this.properties.wasStreamingBeforeTTS && this.properties.streamEnabled) {
                    console.log(`[AudioOutput] 🔄 Resuming stream on speakers:`, this.getSpeakerIds());
                    await this.playStream();
                    this.properties.wasStreamingBeforeTTS = false;
                } else {
                    console.log(`[AudioOutput] ⏭️ Skipping resume (wasStreaming=${this.properties.wasStreamingBeforeTTS}, enabled=${this.properties.streamEnabled})`);
                }
            }, this.properties.resumeDelay);
        }

        async sendTTS(message, speakerIds) {
            if (window.socket) {
                if (this.properties.ttsService === 'elevenlabs') {
                    window.socket.emit('request-elevenlabs-tts', {
                        message: message,
                        voiceId: this.properties.elevenLabsVoiceId,
                        mediaPlayerIds: speakerIds
                    });
                } else {
                    speakerIds.forEach(speakerId => {
                        window.socket.emit('request-tts', {
                            entityId: speakerId,
                            message: message,
                            options: { 
                                tts_service: this.properties.ttsService,
                                tts_entity_id: this.properties.ttsEntityId
                            }
                        });
                    });
                }
                return true;
            }
            return false;
        }

        async data(inputs) {
            const trigger = inputs.trigger?.[0];
            const dynamicMessage = inputs.message?.[0];
            const dynamicStreamUrl = inputs.streamUrl?.[0];

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
            const speakerIds = this.getSpeakerIds();

            if (triggerIsTrue && !wasTriggered && (now - this._lastSentTime) > debounceMs) {
                this._lastTrigger = true;
                this._lastSentTime = now;

                const message = (dynamicMessage !== undefined && dynamicMessage !== null && dynamicMessage !== '')
                    ? dynamicMessage
                    : this.properties.message;

                if (speakerIds.length > 0 && message) {
                    // Pause stream, send TTS, schedule resume
                    await this.pauseStreamForTTS();
                    const success = await this.sendTTS(message, speakerIds);
                    this.properties.lastResult = success;
                    this.resumeStreamAfterTTS();
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
                message: this.properties.message,
                ttsService: this.properties.ttsService,
                ttsEntityId: this.properties.ttsEntityId,
                elevenLabsVoiceId: this.properties.elevenLabsVoiceId,
                elevenLabsVoiceName: this.properties.elevenLabsVoiceName,
                stations: this.properties.stations,
                selectedStation: this.properties.selectedStation,
                customStreamUrl: this.properties.customStreamUrl,
                streamVolume: this.properties.streamVolume,
                streamEnabled: this.properties.streamEnabled,
                resumeDelay: this.properties.resumeDelay
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.mediaPlayerIds !== undefined) this.properties.mediaPlayerIds = props.mediaPlayerIds;
            if (props.mediaPlayerId !== undefined) this.properties.mediaPlayerId = props.mediaPlayerId;
            if (props.message !== undefined) this.properties.message = props.message;
            if (props.ttsService !== undefined) this.properties.ttsService = props.ttsService;
            if (props.ttsEntityId !== undefined) this.properties.ttsEntityId = props.ttsEntityId;
            if (props.elevenLabsVoiceId !== undefined) this.properties.elevenLabsVoiceId = props.elevenLabsVoiceId;
            if (props.elevenLabsVoiceName !== undefined) this.properties.elevenLabsVoiceName = props.elevenLabsVoiceName;
            if (props.stations !== undefined) this.properties.stations = props.stations;
            if (props.selectedStation !== undefined) this.properties.selectedStation = props.selectedStation;
            if (props.customStreamUrl !== undefined) this.properties.customStreamUrl = props.customStreamUrl;
            if (props.streamVolume !== undefined) this.properties.streamVolume = props.streamVolume;
            if (props.streamEnabled !== undefined) this.properties.streamEnabled = props.streamEnabled;
            if (props.resumeDelay !== undefined) this.properties.resumeDelay = props.resumeDelay;

            // Migrate legacy
            if (!this.properties.mediaPlayerIds?.length && this.properties.mediaPlayerId) {
                this.properties.mediaPlayerIds = [this.properties.mediaPlayerId];
            }
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
        
        // Streaming state
        const [stations, setStations] = useState(data.properties.stations || [...DEFAULT_STATIONS]);
        const [selectedStation, setSelectedStation] = useState(data.properties.selectedStation || 0);
        const [customStreamUrl, setCustomStreamUrl] = useState(data.properties.customStreamUrl || '');
        const [streamVolume, setStreamVolume] = useState(data.properties.streamVolume || 50);
        const [streamEnabled, setStreamEnabled] = useState(data.properties.streamEnabled || false);
        const [isStreaming, setIsStreaming] = useState(data.properties.isStreaming || false);
        const [showStationEditor, setShowStationEditor] = useState(false);
        const [editingStation, setEditingStation] = useState(null);
        
        // Collapsed sections
        const [showTTSSection, setShowTTSSection] = useState(true);
        const [showStreamSection, setShowStreamSection] = useState(true);
        
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Sync streaming state from node
        useEffect(() => {
            const interval = setInterval(() => {
                setIsStreaming(data.properties.isStreaming);
            }, 500);
            return () => clearInterval(interval);
        }, []);

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
                if (data.changeCallback) data.changeCallback();
                return newSelection;
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
            
            // Pause stream if playing
            if (data.properties.isStreaming) {
                data.pauseStreamForTTS();
            }
            
            if (window.socket) {
                if (ttsService === 'elevenlabs') {
                    window.socket.emit('request-elevenlabs-tts', {
                        message: message,
                        voiceId: selectedVoice,
                        mediaPlayerIds: selectedPlayers
                    });
                } else {
                    selectedPlayers.forEach(speakerId => {
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
                // Schedule resume
                data.resumeStreamAfterTTS();
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

        const handleStationChange = (e) => {
            const idx = parseInt(e.target.value, 10);
            setSelectedStation(idx);
            data.properties.selectedStation = idx;
            // If streaming, switch to new station
            if (data.properties.isStreaming) {
                data.playStream();
            }
        };

        const handleVolumeChange = (e) => {
            const vol = parseInt(e.target.value, 10);
            setStreamVolume(vol);
            data.properties.streamVolume = vol;
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

        // Styles
        const nodeStyle = {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #00d9ff',
            borderRadius: '12px',
            padding: '12px',
            minWidth: '280px',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        };

        const sectionHeaderStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            cursor: 'pointer',
            borderBottom: '1px solid #333'
        };

        const selectStyle = {
            width: '100%',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#1a1a2e',
            color: '#fff',
            fontSize: '11px'
        };

        const inputStyle = {
            width: '100%',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#1a1a2e',
            color: '#fff',
            fontSize: '11px',
            boxSizing: 'border-box'
        };

        const buttonStyle = {
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: 'linear-gradient(135deg, #00d9ff 0%, #0099cc 100%)',
            color: '#000',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '11px'
        };

        const labelStyle = {
            fontSize: '10px',
            color: '#888',
            marginBottom: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
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

            // IO Container
            React.createElement('div', {
                key: 'io',
                style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }
            }, [
                React.createElement('div', { key: 'inputs', style: { display: 'flex', flexDirection: 'column' } }, renderInputs()),
                React.createElement('div', { key: 'outputs', style: { display: 'flex', flexDirection: 'column' } }, renderOutputs())
            ]),

            // Speaker selection (shared between TTS and streaming)
            React.createElement('div', { key: 'speaker-section', style: { marginBottom: '10px' } }, [
                React.createElement('div', { key: 'label', style: labelStyle }, [
                    `🔈 Speakers (${selectedPlayers.length})`,
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: 'Select speaker(s) for both TTS and streaming', size: 10 })
                ]),
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
                showSpeakerList && React.createElement('div', {
                    key: 'speaker-list',
                    style: { maxHeight: '120px', overflowY: 'auto', background: '#1a1a2e', border: '1px solid #444', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '4px' }
                }, mediaPlayers.map(p => {
                    const id = p.id?.replace('ha_', '') || p.entity_id;
                    const name = p.name || p.friendly_name || id;
                    const isChecked = selectedPlayers.includes(id);
                    return React.createElement('label', {
                        key: id,
                        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 6px', cursor: 'pointer', borderRadius: '4px', background: isChecked ? 'rgba(0, 217, 255, 0.15)' : 'transparent' },
                        onPointerDown: (e) => e.stopPropagation()
                    }, [
                        React.createElement('input', { key: 'cb', type: 'checkbox', checked: isChecked, onChange: () => handlePlayerToggle(id), style: { accentColor: '#00d9ff' } }),
                        React.createElement('span', { key: 'name', style: { fontSize: '10px' } }, name)
                    ]);
                }))
            ]),

            // === STREAMING SECTION ===
            React.createElement('div', { key: 'stream-section', style: { marginBottom: '8px', border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' } }, [
                // Section header
                React.createElement('div', {
                    key: 'stream-header',
                    onClick: () => setShowStreamSection(!showStreamSection),
                    style: { ...sectionHeaderStyle, padding: '6px 8px', background: '#16213e' }
                }, [
                    React.createElement('span', { key: 'title', style: { fontSize: '11px', fontWeight: '600' } }, '📻 Background Stream'),
                    React.createElement('span', { key: 'arrow', style: { fontSize: '10px' } }, showStreamSection ? '▼' : '▶')
                ]),
                
                // Stream content
                showStreamSection && React.createElement('div', { key: 'stream-content', style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                    // Station dropdown + add button
                    React.createElement('div', { key: 'station-row', style: { display: 'flex', gap: '4px' } }, [
                        React.createElement('select', {
                            key: 'station-select',
                            value: selectedStation,
                            onChange: handleStationChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { ...selectStyle, flex: 1 }
                        }, stations.map((s, i) => React.createElement('option', { key: i, value: i }, s.name))),
                        React.createElement('button', {
                            key: 'add-btn',
                            onClick: handleAddStation,
                            onPointerDown: (e) => e.stopPropagation(),
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

                    // Volume slider
                    React.createElement('div', { key: 'volume-row', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                        React.createElement('span', { key: 'label', style: { fontSize: '10px', color: '#888' } }, 'Vol'),
                        React.createElement('input', {
                            key: 'slider',
                            type: 'range',
                            min: 0,
                            max: 100,
                            value: streamVolume,
                            onChange: handleVolumeChange,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { flex: 1 }
                        }),
                        React.createElement('span', { key: 'value', style: { fontSize: '10px', width: '28px' } }, `${streamVolume}%`)
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
                    onClick: () => setShowTTSSection(!showTTSSection),
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

            // Station editor modal
            showStationEditor && React.createElement('div', {
                key: 'station-modal',
                style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', padding: '12px', zIndex: 100 }
            }, [
                React.createElement('div', { key: 'title', style: { fontWeight: 'bold', marginBottom: '10px' } }, editingStation?.isNew ? 'Add Station' : 'Edit Station'),
                React.createElement('input', {
                    key: 'name',
                    type: 'text',
                    value: editingStation?.name || '',
                    onChange: (e) => setEditingStation({ ...editingStation, name: e.target.value }),
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'Station name',
                    style: { ...inputStyle, marginBottom: '8px' }
                }),
                React.createElement('input', {
                    key: 'url',
                    type: 'text',
                    value: editingStation?.url || '',
                    onChange: (e) => setEditingStation({ ...editingStation, url: e.target.value }),
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'Stream URL',
                    style: { ...inputStyle, marginBottom: '8px' }
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
                        onClick: () => { setEditingStation(null); setShowStationEditor(false); },
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { ...buttonStyle, flex: 1, background: '#666' }
                    }, 'Cancel')
                ])
            ])
        ]);
    }

    // Register - keep old name for backwards compatibility
    if (window.nodeRegistry) {
        window.nodeRegistry.register('TTSAnnouncementNode', {
            label: 'Audio Output',
            category: 'Home Assistant',
            nodeClass: TTSAnnouncementNode,
            component: TTSAnnouncementComponent,
            factory: (cb) => new TTSAnnouncementNode(cb)
        });
        console.log('[Plugins] TTSAnnouncementNode (Audio Output) registered');
    }
})();
