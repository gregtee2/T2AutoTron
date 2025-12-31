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
            this.height = 220;

            this.properties = {
                mediaPlayerId: '',
                message: 'Hello, this is a test announcement',
                lastResult: null
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addInput('message', new ClassicPreset.Input(sockets.any, 'Message'));

            // Outputs
            this.addOutput('success', new ClassicPreset.Output(sockets.boolean, 'Success'));

            // Track last trigger to detect edges
            this._lastTrigger = undefined;
        }

        async data(inputs) {
            const trigger = inputs.trigger?.[0];
            const dynamicMessage = inputs.message?.[0];

            // Detect rising edge of trigger
            if (trigger && trigger !== this._lastTrigger) {
                this._lastTrigger = trigger;
                
                const message = dynamicMessage || this.properties.message;
                if (this.properties.mediaPlayerId && message) {
                    // Send TTS via socket
                    if (window.socket) {
                        window.socket.emit('request-tts', {
                            entityId: this.properties.mediaPlayerId,
                            message: message
                        });
                        this.properties.lastResult = true;
                    }
                }
            } else if (!trigger) {
                this._lastTrigger = undefined;
            }

            return {
                success: this.properties.lastResult ?? false
            };
        }

        serialize() {
            return {
                mediaPlayerId: this.properties.mediaPlayerId,
                message: this.properties.message
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.mediaPlayerId !== undefined) this.properties.mediaPlayerId = props.mediaPlayerId;
            if (props.message !== undefined) this.properties.message = props.message;
        }
    }

    // React Component
    function TTSAnnouncementComponent({ data, emit }) {
        const [mediaPlayers, setMediaPlayers] = useState([]);
        const [selectedPlayer, setSelectedPlayer] = useState(data.properties.mediaPlayerId || '');
        const [message, setMessage] = useState(data.properties.message || '');
        const [testStatus, setTestStatus] = useState('');
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Fetch media players on mount
        useEffect(() => {
            if (window.socket) {
                const onMediaPlayers = (players) => {
                    setMediaPlayers(players || []);
                    // If we have a saved player, verify it still exists
                    if (data.properties.mediaPlayerId) {
                        const exists = players?.some(p => p.id === data.properties.mediaPlayerId || 
                            p.id === `ha_${data.properties.mediaPlayerId}`);
                        if (!exists && players?.length > 0) {
                            // Player no longer exists, clear selection
                        }
                    }
                };

                window.socket.on('media-players', onMediaPlayers);
                window.socket.emit('request-media-players');

                // Also listen for TTS results for test button feedback
                const onTTSResult = (result) => {
                    if (result.success) {
                        setTestStatus('✓ Sent!');
                    } else {
                        setTestStatus('✗ ' + (result.error || 'Failed'));
                    }
                    setTimeout(() => setTestStatus(''), 3000);
                };
                window.socket.on('tts-result', onTTSResult);

                return () => {
                    window.socket.off('media-players', onMediaPlayers);
                    window.socket.off('tts-result', onTTSResult);
                };
            }
        }, []);

        const handlePlayerChange = (e) => {
            const value = e.target.value;
            setSelectedPlayer(value);
            data.properties.mediaPlayerId = value;
            if (data.changeCallback) data.changeCallback();
        };

        const handleMessageChange = (e) => {
            setMessage(e.target.value);
            data.properties.message = e.target.value;
        };

        const handleTest = () => {
            if (!selectedPlayer) {
                setTestStatus('Select a speaker first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            if (!message) {
                setTestStatus('Enter a message first');
                setTimeout(() => setTestStatus(''), 2000);
                return;
            }
            setTestStatus('Sending...');
            if (window.socket) {
                window.socket.emit('request-tts', {
                    entityId: selectedPlayer,
                    message: message
                });
            }
        };

        // Render inputs
        const renderInputs = () => {
            return Object.entries(data.inputs || {}).map(([key, input]) => {
                const socket = input.socket;
                return React.createElement('div', {
                    key: `input-${key}`,
                    className: 'rete-input',
                    'data-testid': `input-${key}`
                }, [
                    React.createElement(window.RefComponent, {
                        key: 'ref',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: socket } })
                    }),
                    React.createElement('span', { key: 'label', className: 'input-title' }, input.label || key)
                ]);
            });
        };

        // Render outputs
        const renderOutputs = () => {
            return Object.entries(data.outputs || {}).map(([key, output]) => {
                const socket = output.socket;
                return React.createElement('div', {
                    key: `output-${key}`,
                    className: 'rete-output',
                    'data-testid': `output-${key}`
                }, [
                    React.createElement('span', { key: 'label', className: 'output-title' }, output.label || key),
                    React.createElement(window.RefComponent, {
                        key: 'ref',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: socket } })
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

            // Inputs
            React.createElement('div', { key: 'inputs', className: 'rete-inputs' }, renderInputs()),

            // Controls
            React.createElement('div', { key: 'controls', style: controlsStyle }, [
                // Media Player dropdown
                React.createElement('div', { key: 'player-row' }, [
                    React.createElement('div', { key: 'label', style: labelStyle }, [
                        'Speaker',
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.mediaPlayer, size: 10 })
                    ]),
                    React.createElement('select', {
                        key: 'select',
                        value: selectedPlayer,
                        onChange: handlePlayerChange,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: selectStyle
                    }, [
                        React.createElement('option', { key: 'empty', value: '' }, '-- Select Speaker --'),
                        ...mediaPlayers.map(p => {
                            const id = p.id?.replace('ha_', '') || p.entity_id;
                            const name = p.name || p.friendly_name || id;
                            return React.createElement('option', { key: id, value: id }, name);
                        })
                    ])
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
            ]),

            // Outputs
            React.createElement('div', { key: 'outputs', className: 'rete-outputs' }, renderOutputs())
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
