/**
 * InternetRadioNode.js
 * 
 * Plays internet radio streams through Home Assistant media players.
 * Supports Shoutcast, Icecast, and any direct stream URL.
 * 
 * 🦴 CAVEMAN VERSION:
 * This is like a jukebox remote control. You tell it:
 * - What radio station to play (stream URL)
 * - Which speaker to play it on (Sonos, Google Home, etc.)
 * - When to play/stop (via triggers)
 * 
 * HA does the actual work of sending the audio to your speakers.
 */

(function() {
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[InternetRadioNode] Dependencies not ready');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;

    // Default stations to get started
    const DEFAULT_STATIONS = [
        { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
        { name: 'SomaFM Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
        { name: 'Jazz24', url: 'https://live.wostreaming.net/direct/ppm-jazz24aac-ibc1' }
    ];

    // Tooltip content
    const tooltips = {
        node: "Plays internet radio streams through your Home Assistant media players (Sonos, Google Home, Echo, etc.). Add stream URLs, select a speaker, and control playback via triggers.",
        inputs: {
            trigger: "Boolean: true = play, false = stop. Connect a TimeRangeNode to play music during certain hours.",
            stationIndex: "Number (0-based): Which station from your list to play. Connect a Counter or Switch node.",
            speaker: "String: Override the selected speaker with entity_id (e.g., 'media_player.living_room')"
        },
        outputs: {
            playing: "Boolean: true when stream is currently playing",
            station: "String: Name of the currently selected station"
        },
        controls: {
            speaker: "Select which HA media player to use for playback",
            volume: "Playback volume (0-100%)",
            stations: "Click + to add new stations. Double-click a row to edit."
        }
    };

    /**
     * InternetRadioNode class
     */
    class InternetRadioNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Internet Radio");
            this.changeCallback = changeCallback;
            this.width = 320;
            this.height = 400;

            this.properties = {
                stations: [...DEFAULT_STATIONS],
                selectedStation: 0,
                selectedSpeaker: '',
                volume: 50,
                isPlaying: false,
                debug: false
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addInput('stationIndex', new ClassicPreset.Input(sockets.number, 'Station #'));
            this.addInput('speaker', new ClassicPreset.Input(sockets.any, 'Speaker'));

            // Outputs
            this.addOutput('playing', new ClassicPreset.Output(sockets.boolean, 'Playing'));
            this.addOutput('station', new ClassicPreset.Output(sockets.any, 'Station'));
        }

        async playStream() {
            const station = this.properties.stations[this.properties.selectedStation];
            const speaker = this.properties.selectedSpeaker;

            if (!station || !speaker) {
                console.warn('[InternetRadio] No station or speaker selected');
                return;
            }

            try {
                const response = await (window.apiFetch || fetch)('/api/media/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityId: speaker,
                        mediaUrl: station.url,
                        mediaType: 'music',
                        volume: this.properties.volume / 100
                    })
                });

                if (response.ok) {
                    this.properties.isPlaying = true;
                    if (this.changeCallback) this.changeCallback();
                    console.log(`[InternetRadio] ▶️ Playing "${station.name}" on ${speaker}`);
                }
            } catch (err) {
                console.error('[InternetRadio] Play error:', err);
            }
        }

        async stopStream() {
            const speaker = this.properties.selectedSpeaker;
            if (!speaker) return;

            try {
                const response = await (window.apiFetch || fetch)('/api/media/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entityId: speaker })
                });

                if (response.ok) {
                    this.properties.isPlaying = false;
                    if (this.changeCallback) this.changeCallback();
                    console.log(`[InternetRadio] ⏹️ Stopped playback on ${speaker}`);
                }
            } catch (err) {
                console.error('[InternetRadio] Stop error:', err);
            }
        }

        async setVolume(volume) {
            const speaker = this.properties.selectedSpeaker;
            if (!speaker) return;

            try {
                await (window.apiFetch || fetch)('/api/media/volume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityId: speaker,
                        volume: volume / 100
                    })
                });
            } catch (err) {
                console.error('[InternetRadio] Volume error:', err);
            }
        }

        data(inputs) {
            // Handle trigger input
            const triggerInput = inputs.trigger?.[0];
            if (triggerInput !== undefined) {
                if (triggerInput && !this.properties.isPlaying) {
                    this.playStream();
                } else if (!triggerInput && this.properties.isPlaying) {
                    this.stopStream();
                }
            }

            // Handle station index input
            const stationIndex = inputs.stationIndex?.[0];
            if (stationIndex !== undefined && stationIndex !== this.properties.selectedStation) {
                const idx = Math.max(0, Math.min(stationIndex, this.properties.stations.length - 1));
                this.properties.selectedStation = idx;
                // If playing, switch to new station
                if (this.properties.isPlaying) {
                    this.playStream();
                }
            }

            // Handle speaker override input
            const speakerInput = inputs.speaker?.[0];
            if (speakerInput && speakerInput !== this.properties.selectedSpeaker) {
                this.properties.selectedSpeaker = speakerInput;
            }

            const currentStation = this.properties.stations[this.properties.selectedStation];
            return {
                playing: this.properties.isPlaying,
                station: currentStation?.name || ''
            };
        }

        serialize() {
            return {
                stations: this.properties.stations,
                selectedStation: this.properties.selectedStation,
                selectedSpeaker: this.properties.selectedSpeaker,
                volume: this.properties.volume,
                isPlaying: false // Don't persist playing state
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                this.properties.stations = props.stations || [...DEFAULT_STATIONS];
                this.properties.selectedStation = props.selectedStation || 0;
                this.properties.selectedSpeaker = props.selectedSpeaker || '';
                this.properties.volume = props.volume ?? 50;
            }
        }
    }

    /**
     * React Component for InternetRadioNode
     */
    function InternetRadioComponent({ data, emit }) {
        const [stations, setStations] = useState(data.properties.stations || []);
        const [selectedStation, setSelectedStation] = useState(data.properties.selectedStation || 0);
        const [selectedSpeaker, setSelectedSpeaker] = useState(data.properties.selectedSpeaker || '');
        const [volume, setVolume] = useState(data.properties.volume || 50);
        const [isPlaying, setIsPlaying] = useState(data.properties.isPlaying || false);
        const [speakers, setSpeakers] = useState([]);
        const [editingStation, setEditingStation] = useState(null);
        const [newStationName, setNewStationName] = useState('');
        const [newStationUrl, setNewStationUrl] = useState('');
        const [showAddForm, setShowAddForm] = useState(false);

        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Fetch media players from HA
        useEffect(() => {
            const fetchSpeakers = () => {
                if (window.socket) {
                    window.socket.emit('request-ha-devices');
                }
            };

            const handleDevices = (devices) => {
                const mediaPlayers = devices.filter(d => 
                    d.id?.includes('media_player') || 
                    d.type === 'media_player'
                );
                setSpeakers(mediaPlayers);

                // Auto-select first speaker if none selected
                if (!selectedSpeaker && mediaPlayers.length > 0) {
                    const firstSpeaker = mediaPlayers[0].id?.replace('ha_', '') || mediaPlayers[0].entity_id;
                    setSelectedSpeaker(firstSpeaker);
                    data.properties.selectedSpeaker = firstSpeaker;
                }
            };

            if (window.socket) {
                window.socket.on('ha-devices', handleDevices);
                fetchSpeakers();
            }

            return () => {
                if (window.socket) {
                    window.socket.off('ha-devices', handleDevices);
                }
            };
        }, []);

        // Sync with node properties
        useEffect(() => {
            const sync = () => {
                setIsPlaying(data.properties.isPlaying);
                setSelectedStation(data.properties.selectedStation);
            };
            
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                sync();
                if (originalCallback) originalCallback();
            };

            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        // Handle play button
        const handlePlay = () => {
            data.playStream();
            setIsPlaying(true);
        };

        // Handle stop button
        const handleStop = () => {
            data.stopStream();
            setIsPlaying(false);
        };

        // Handle station change
        const handleStationChange = (idx) => {
            setSelectedStation(idx);
            data.properties.selectedStation = idx;
            if (isPlaying) {
                data.playStream();
            }
            if (data.changeCallback) data.changeCallback();
        };

        // Handle speaker change
        const handleSpeakerChange = (e) => {
            const speaker = e.target.value;
            setSelectedSpeaker(speaker);
            data.properties.selectedSpeaker = speaker;
        };

        // Handle volume change
        const handleVolumeChange = (e) => {
            const vol = parseInt(e.target.value);
            setVolume(vol);
            data.properties.volume = vol;
            data.setVolume(vol);
        };

        // Add new station
        const handleAddStation = () => {
            if (!newStationName.trim() || !newStationUrl.trim()) return;
            
            const newStations = [...stations, { name: newStationName.trim(), url: newStationUrl.trim() }];
            setStations(newStations);
            data.properties.stations = newStations;
            setNewStationName('');
            setNewStationUrl('');
            setShowAddForm(false);
            if (data.changeCallback) data.changeCallback();
        };

        // Remove station
        const handleRemoveStation = (idx) => {
            const newStations = stations.filter((_, i) => i !== idx);
            setStations(newStations);
            data.properties.stations = newStations;
            if (selectedStation >= newStations.length) {
                setSelectedStation(Math.max(0, newStations.length - 1));
                data.properties.selectedStation = Math.max(0, newStations.length - 1);
            }
            if (data.changeCallback) data.changeCallback();
        };

        // Styles
        const containerStyle = {
            padding: '8px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        };

        const sectionStyle = {
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '4px',
            padding: '8px'
        };

        const labelStyle = {
            color: '#aaa',
            fontSize: '10px',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        };

        const selectStyle = {
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: '1px solid #444',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '11px'
        };

        const buttonStyle = {
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12px'
        };

        const playButtonStyle = {
            ...buttonStyle,
            background: isPlaying ? '#666' : '#4CAF50',
            color: '#fff',
            flex: 1
        };

        const stopButtonStyle = {
            ...buttonStyle,
            background: isPlaying ? '#f44336' : '#666',
            color: '#fff',
            flex: 1
        };

        const stationRowStyle = (isSelected) => ({
            display: 'flex',
            alignItems: 'center',
            padding: '6px',
            background: isSelected ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.05)',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '4px',
            border: isSelected ? '1px solid #4CAF50' : '1px solid transparent'
        });

        const inputStyle = {
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: '1px solid #444',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '11px',
            marginBottom: '4px'
        };

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                icon: '📻',
                title: 'Internet Radio',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: isPlaying ? '#4CAF50' : '#666'
            }),

            // Speaker selector
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: labelStyle },
                    '🔊 Speaker',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.speaker, size: 10 })
                ),
                React.createElement('select', {
                    style: selectStyle,
                    value: selectedSpeaker,
                    onChange: handleSpeakerChange,
                    onPointerDown: (e) => e.stopPropagation()
                },
                    React.createElement('option', { value: '' }, '-- Select Speaker --'),
                    speakers.map((speaker, idx) => 
                        React.createElement('option', {
                            key: idx,
                            value: speaker.id?.replace('ha_', '') || speaker.entity_id
                        }, speaker.name || speaker.id || speaker.entity_id)
                    )
                )
            ),

            // Volume control
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: labelStyle },
                    `🔉 Volume: ${volume}%`,
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.volume, size: 10 })
                ),
                React.createElement('input', {
                    type: 'range',
                    min: 0,
                    max: 100,
                    value: volume,
                    onChange: handleVolumeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { width: '100%' }
                })
            ),

            // Station list
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: { ...labelStyle, justifyContent: 'space-between' } },
                    React.createElement('span', null, '📡 Stations'),
                    React.createElement('button', {
                        style: { ...buttonStyle, padding: '2px 8px', background: '#2196F3', fontSize: '10px' },
                        onClick: () => setShowAddForm(!showAddForm),
                        onPointerDown: (e) => e.stopPropagation()
                    }, showAddForm ? '✕' : '+')
                ),

                // Add station form
                showAddForm && React.createElement('div', { style: { marginBottom: '8px' } },
                    React.createElement('input', {
                        style: inputStyle,
                        placeholder: 'Station name',
                        value: newStationName,
                        onChange: (e) => setNewStationName(e.target.value),
                        onPointerDown: (e) => e.stopPropagation()
                    }),
                    React.createElement('input', {
                        style: inputStyle,
                        placeholder: 'Stream URL (e.g., https://...)',
                        value: newStationUrl,
                        onChange: (e) => setNewStationUrl(e.target.value),
                        onPointerDown: (e) => e.stopPropagation()
                    }),
                    React.createElement('button', {
                        style: { ...buttonStyle, background: '#4CAF50', width: '100%', padding: '6px' },
                        onClick: handleAddStation,
                        onPointerDown: (e) => e.stopPropagation()
                    }, '➕ Add Station')
                ),

                // Station list
                React.createElement('div', { style: { maxHeight: '120px', overflowY: 'auto' } },
                    stations.map((station, idx) =>
                        React.createElement('div', {
                            key: idx,
                            style: stationRowStyle(idx === selectedStation),
                            onClick: () => handleStationChange(idx),
                            onPointerDown: (e) => e.stopPropagation()
                        },
                            React.createElement('span', { 
                                style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                            }, `${idx + 1}. ${station.name}`),
                            React.createElement('button', {
                                style: { 
                                    background: 'transparent', 
                                    border: 'none', 
                                    color: '#f44336', 
                                    cursor: 'pointer',
                                    padding: '2px 4px'
                                },
                                onClick: (e) => { e.stopPropagation(); handleRemoveStation(idx); },
                                onPointerDown: (e) => e.stopPropagation(),
                                title: 'Remove station'
                            }, '🗑️')
                        )
                    )
                )
            ),

            // Play/Stop buttons
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                React.createElement('button', {
                    style: playButtonStyle,
                    onClick: handlePlay,
                    onPointerDown: (e) => e.stopPropagation(),
                    disabled: !selectedSpeaker || stations.length === 0
                }, '▶️ Play'),
                React.createElement('button', {
                    style: stopButtonStyle,
                    onClick: handleStop,
                    onPointerDown: (e) => e.stopPropagation(),
                    disabled: !selectedSpeaker
                }, '⏹️ Stop')
            ),

            // Status
            React.createElement('div', { 
                style: { 
                    textAlign: 'center', 
                    fontSize: '10px', 
                    color: isPlaying ? '#4CAF50' : '#666',
                    padding: '4px'
                } 
            }, isPlaying 
                ? `▶️ Playing: ${stations[selectedStation]?.name || 'Unknown'}`
                : '⏹️ Stopped'
            )
        );
    }

    // Register the node
    if (window.nodeRegistry) {
        window.nodeRegistry.register('InternetRadioNode', {
            label: "Internet Radio",
            category: "Home Assistant",
            nodeClass: InternetRadioNode,
            component: InternetRadioComponent,
            factory: (cb) => new InternetRadioNode(cb)
        });
        console.log('[InternetRadioNode] ✅ Registered');
    }
})();
