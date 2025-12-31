/**
 * TTSAnnouncementNode.js
 * 
 * Sends text-to-speech announcements to Home Assistant media_player entities (HomePod, Sonos, etc.)
 * 
 * Inputs:
 *   - trigger: Fire to send the announcement
 *   - message: Optional - text input that overrides the static message
 * 
 * Outputs:
 *   - success: Boolean - true when announcement sent successfully
 * 
 * Features:
 *   - Dropdown to select media_player from HA
 *   - Static message field OR dynamic message from input
 *   - Test button to preview announcement
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

    // Tooltips
    const tooltips = {
        node: "Send text-to-speech announcements to HomePod, Sonos, or any HA media_player. Connect a trigger to fire the announcement.",
        inputs: {
            trigger: "When this receives any value, the announcement is sent",
            message: "Dynamic message text (overrides the static message field)"
        },
        outputs: {
            success: "True when announcement sent, false on error"
        },
        controls: {
            mediaPlayer: "Select the speaker/media_player to announce to",
            message: "The text to speak (or leave empty and connect a message input)",
            test: "Send a test announcement now"
        }
    };

    class TTSAnnouncementNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("TTS Announcement");
            this.changeCallback = changeCallback;
            this.width = 280;
            this.height = 320;

            this.properties = {
                mediaPlayerIds: [],  // Array of selected speaker IDs (multi-select)
                mediaPlayerId: '',   // Legacy single player (for backwards compat)
                message: 'Hello, this is a test announcement',
                ttsService: 'tts/speak',
                ttsEntityId: '', // The TTS engine entity (e.g., tts.google_translate_en_com) - required for tts.speak
                elevenLabsVoiceId: '', // ElevenLabs voice ID
                elevenLabsVoiceName: '', // Display name for UI
                lastResult: null
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addInput('message', new ClassicPreset.Input(sockets.any, 'Message'));

            // Outputs
            this.addOutput('success', new ClassicPreset.Output(sockets.boolean, 'Success'));

            // Track last trigger to detect rising edge (false->true only)
            this._lastTrigger = false;
            this._lastSentTime = 0;  // Debounce: prevent rapid-fire
        }

        // Get the list of speakers to use (supports legacy single or new multi)
        getSpeakerIds() {
            if (this.properties.mediaPlayerIds && this.properties.mediaPlayerIds.length > 0) {
                return this.properties.mediaPlayerIds;
            }
            // Legacy fallback
            if (this.properties.mediaPlayerId) {
                return [this.properties.mediaPlayerId];
            }
            return [];
        }

        async data(inputs) {
            const trigger = inputs.trigger?.[0];
            const dynamicMessage = inputs.message?.[0];

            // Strict rising edge detection: only fire when trigger goes from false/undefined to TRUE
            const triggerIsTrue = trigger === true;
            const wasTriggered = this._lastTrigger === true;
            
            // Debounce: don't send more than once per second
            const now = Date.now();
            const debounceMs = 1000;
            
            const speakerIds = this.getSpeakerIds();
            
            if (triggerIsTrue && !wasTriggered && (now - this._lastSentTime) > debounceMs) {
                this._lastTrigger = true;
                this._lastSentTime = now;
                
                // Use dynamic message if provided, otherwise fall back to static
                // Use explicit check so empty string from dynamic input doesn't fall back
                const message = (dynamicMessage !== undefined && dynamicMessage !== null && dynamicMessage !== '') 
                    ? dynamicMessage 
                    : this.properties.message;
                    
                if (speakerIds.length > 0 && message) {
                    // Send TTS via socket - now supports multiple speakers
                    if (window.socket) {
                        if (this.properties.ttsService === 'elevenlabs') {
                            // Use ElevenLabs TTS - pass array of speakers
                            window.socket.emit('request-elevenlabs-tts', {
                                message: message,
                                voiceId: this.properties.elevenLabsVoiceId,
                                mediaPlayerIds: speakerIds  // NEW: array of speakers
                            });
                        } else {
                            // Use HA TTS - send to each speaker
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
                        this.properties.lastResult = true;
                    }
                }
            } else if (!triggerIsTrue) {
                // Reset trigger state when trigger goes to false/undefined
                this._lastTrigger = false;
            }

            return {
                success: this.properties.lastResult ?? false
            };
        }

        serialize() {
            return {
                mediaPlayerIds: this.properties.mediaPlayerIds,
                mediaPlayerId: this.properties.mediaPlayerId,  // Keep for backwards compat
                message: this.properties.message,
                ttsService: this.properties.ttsService,
                ttsEntityId: this.properties.ttsEntityId,
                elevenLabsVoiceId: this.properties.elevenLabsVoiceId,
                elevenLabsVoiceName: this.properties.elevenLabsVoiceName
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
            
            // Migrate legacy single player to array
            if (!this.properties.mediaPlayerIds?.length && this.properties.mediaPlayerId) {
                this.properties.mediaPlayerIds = [this.properties.mediaPlayerId];
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
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Migrate legacy single player on mount
        useEffect(() => {
            if (data.properties.mediaPlayerId && !data.properties.mediaPlayerIds?.length) {
                const migrated = [data.properties.mediaPlayerId];
                setSelectedPlayers(migrated);
                data.properties.mediaPlayerIds = migrated;
            }
        }, []);

        // Fetch media players and TTS entities on mount ONLY (empty deps = runs once)
        // Use unique event names scoped to this node instance to prevent cross-talk
        const nodeId = data.id;
        
        useEffect(() => {
            if (!window.socket) return;
            
            // Create handlers with stable references
            const onMediaPlayers = (players) => {
                setMediaPlayers(players || []);
            };

            const onTtsEntities = (entities) => {
                setTtsEntities(entities || []);
                // Auto-select first TTS entity if none selected
                if (!selectedTtsEntity && entities?.length > 0) {
                    const first = entities[0]?.entity_id || '';
                    setSelectedTtsEntity(first);
                    data.properties.ttsEntityId = first;
                }
            };

            const onElevenLabsVoices = (voices) => {
                if (voices?.error) {
                    console.warn('ElevenLabs voices error:', voices.error);
                    setElevenLabsVoices([]);
                } else {
                    setElevenLabsVoices(voices || []);
                    // Auto-select Charlotte if available and no voice selected
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

            // TTS result handlers - use node-scoped event to prevent stacking
            const onTTSResult = (result) => {
                setTestStatus(result.success ? '✓ Sent!' : '✗ ' + (result.error || 'Failed'));
                setTimeout(() => setTestStatus(''), 3000);
            };

            const onElevenLabsResult = (result) => {
                setTestStatus(result.success ? '✓ Playing!' : '✗ ' + (result.error || 'Failed'));
                setTimeout(() => setTestStatus(''), 3000);
            };

            // Remove any existing handlers first (prevents stacking)
            window.socket.off('media-players', onMediaPlayers);
            window.socket.off('tts-entities', onTtsEntities);
            window.socket.off('elevenlabs-voices', onElevenLabsVoices);
            window.socket.off('tts-result', onTTSResult);
            window.socket.off('elevenlabs-tts-result', onElevenLabsResult);
            
            // Now add fresh handlers
            window.socket.on('media-players', onMediaPlayers);
            window.socket.on('tts-entities', onTtsEntities);
            window.socket.on('elevenlabs-voices', onElevenLabsVoices);
            window.socket.on('tts-result', onTTSResult);
            window.socket.on('elevenlabs-tts-result', onElevenLabsResult);
            
            // Request initial data
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
        }, []); // Empty deps = run once on mount, cleanup on unmount

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
                setTestStatus('Select at least one speaker');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (ttsService === 'tts/speak' && !selectedTtsEntity) {
                setTestStatus('Select a TTS engine first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (ttsService === 'elevenlabs' && !selectedVoice) {
                setTestStatus('Select a voice first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (!message) {
                setTestStatus('Enter a message first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            setTestStatus(`Sending to ${selectedPlayers.length} speaker(s)...`);
            if (window.socket) {
                if (ttsService === 'elevenlabs') {
                    // Use ElevenLabs TTS - pass array of speakers
                    window.socket.emit('request-elevenlabs-tts', {
                        message: message,
                        voiceId: selectedVoice,
                        mediaPlayerIds: selectedPlayers
                    });
                } else {
                    // Use HA TTS - send to each speaker
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
            }
        };

        // Render inputs
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

        // Render outputs
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

        const nodeStyle = {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #00d9ff',
            borderRadius: '12px',
            padding: '12px',
            minWidth: '260px',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        };

        const controlsStyle = {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '8px 0'
        };

        const selectStyle = {
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#1a1a2e',
            color: '#fff',
            fontSize: '12px'
        };

        const inputStyle = {
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#1a1a2e',
            color: '#fff',
            fontSize: '12px',
            boxSizing: 'border-box'
        };

        const buttonStyle = {
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: 'linear-gradient(135deg, #00d9ff 0%, #0099cc 100%)',
            color: '#000',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '12px'
        };

        const labelStyle = {
            fontSize: '11px',
            color: '#888',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        };

        return React.createElement('div', { style: nodeStyle, 'data-testid': 'tts-node' }, [
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                key: 'header',
                icon: '📢',
                title: 'TTS Announcement',
                tooltip: tooltips.node
            }) : React.createElement('div', { 
                key: 'header',
                style: { fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }
            }, '📢 TTS Announcement'),

            // IO Container - inputs on left, outputs on right
            React.createElement('div', { 
                key: 'io', 
                style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }
            }, [
                // Inputs (left side)
                React.createElement('div', { key: 'inputs', style: { display: 'flex', flexDirection: 'column' } }, renderInputs()),
                // Outputs (right side)  
                React.createElement('div', { key: 'outputs', style: { display: 'flex', flexDirection: 'column' } }, renderOutputs())
            ]),

            // Controls
            React.createElement('div', { key: 'controls', style: controlsStyle }, [
                // TTS Service dropdown
                React.createElement('div', { key: 'tts-service-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        'TTS Service',
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: 'Choose TTS provider: HA services or ElevenLabs AI voices.', size: 10 })
                    ]),
                    React.createElement('select', {
                        key: 'tts-service-select',
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
                // ElevenLabs Voice dropdown (only shown when elevenlabs is selected)
                ttsService === 'elevenlabs' && React.createElement('div', { key: 'elevenlabs-voice-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        'Voice',
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: 'Select an ElevenLabs AI voice. Requires ELEVENLABS_API_KEY in .env', size: 10 })
                    ]),
                    React.createElement('select', {
                        key: 'voice-select',
                        value: selectedVoice,
                        onChange: handleVoiceChange,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: selectStyle
                    }, [
                        React.createElement('option', { key: 'empty', value: '' }, elevenLabsVoices.length ? '-- Select Voice --' : 'No API key configured'),
                        ...elevenLabsVoices.map(v => {
                            const label = v.labels?.accent ? `${v.name} (${v.labels.accent})` : v.name;
                            return React.createElement('option', { key: v.voice_id, value: v.voice_id }, label);
                        })
                    ])
                ]),
                // TTS Entity dropdown (only shown when tts.speak is selected)
                ttsService === 'tts/speak' && React.createElement('div', { key: 'tts-entity-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        'TTS Engine (Target)',
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: 'The TTS engine entity to use (e.g., Google Translate, Cloud TTS). Required for tts.speak service.', size: 10 })
                    ]),
                    React.createElement('select', {
                        key: 'tts-entity-select',
                        value: selectedTtsEntity,
                        onChange: handleTtsEntityChange,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: selectStyle
                    }, [
                        React.createElement('option', { key: 'empty', value: '' }, '-- Select TTS Engine --'),
                        ...ttsEntities.map(e => {
                            const name = e.friendly_name || e.entity_id?.replace('tts.', '') || e.entity_id;
                            return React.createElement('option', { key: e.entity_id, value: e.entity_id }, name);
                        })
                    ])
                ]),
                // Media Player multi-select
                React.createElement('div', { key: 'player-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        `Speakers (${selectedPlayers.length} selected)`,
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: 'Select one or more speakers to announce to simultaneously', size: 10 })
                    ]),
                    // Toggle button to show/hide speaker list
                    React.createElement('button', {
                        key: 'toggle-btn',
                        onClick: () => setShowSpeakerList(!showSpeakerList),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            ...selectStyle,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }
                    }, [
                        React.createElement('span', { key: 'text' }, 
                            selectedPlayers.length === 0 ? '-- Select Speakers --' : 
                            selectedPlayers.length === 1 ? mediaPlayers.find(p => (p.id?.replace('ha_', '') || p.entity_id) === selectedPlayers[0])?.name || selectedPlayers[0] :
                            `${selectedPlayers.length} speakers selected`
                        ),
                        React.createElement('span', { key: 'arrow' }, showSpeakerList ? '▲' : '▼')
                    ]),
                    // Collapsible speaker list with checkboxes
                    showSpeakerList && React.createElement('div', {
                        key: 'speaker-list',
                        style: {
                            maxHeight: '150px',
                            overflowY: 'auto',
                            background: '#1a1a2e',
                            border: '1px solid #444',
                            borderTop: 'none',
                            borderRadius: '0 0 6px 6px',
                            padding: '4px'
                        }
                    }, mediaPlayers.map(p => {
                        const id = p.id?.replace('ha_', '') || p.entity_id;
                        const name = p.name || p.friendly_name || id;
                        const isChecked = selectedPlayers.includes(id);
                        return React.createElement('label', {
                            key: id,
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '4px 6px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                background: isChecked ? 'rgba(0, 217, 255, 0.15)' : 'transparent'
                            },
                            onPointerDown: (e) => e.stopPropagation()
                        }, [
                            React.createElement('input', {
                                key: 'cb',
                                type: 'checkbox',
                                checked: isChecked,
                                onChange: () => handlePlayerToggle(id),
                                style: { accentColor: '#00d9ff' }
                            }),
                            React.createElement('span', { key: 'name', style: { fontSize: '11px' } }, name)
                        ]);
                    }))
                ]),

                // Message input
                React.createElement('div', { key: 'message-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        'Message',
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.message, size: 10 })
                    ]),
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

                // Test button row
                React.createElement('div', { 
                    key: 'test-row',
                    style: { display: 'flex', alignItems: 'center', gap: '10px' }
                }, [
                    React.createElement('button', {
                        key: 'btn',
                        onClick: handleTest,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: buttonStyle
                    }, '🔊 Test'),
                    testStatus && React.createElement('span', {
                        key: 'status',
                        style: { fontSize: '11px', color: testStatus.includes('✓') ? '#4caf50' : '#ff9800' }
                    }, testStatus)
                ])
            ])
        ]);
    }

    // Register
    if (window.nodeRegistry) {
        window.nodeRegistry.register('TTSAnnouncementNode', {
            label: 'TTS Announcement',
            category: 'Home Assistant',
            nodeClass: TTSAnnouncementNode,
            component: TTSAnnouncementComponent,
            factory: (cb) => new TTSAnnouncementNode(cb)
        });
        console.log('[Plugins] TTSAnnouncementNode registered');
    }
})();
