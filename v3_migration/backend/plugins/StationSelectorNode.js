/**
 * StationSelectorNode.js
 * 
 * Simple station picker. Connect its "Station" output to any 
 * Audio Output node's "📻 SpeakerName" input to override that speaker's station.
 */

(function() {
    'use strict';

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.warn('[StationSelectorNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const sockets = window.sockets;
    const el = React.createElement;
    const RefComponent = window.RefComponent;

    const DEFAULT_STATIONS = [
        { name: 'Lofi Hip Hop', url: 'http://usa9.fastcast4u.com/proxy/jamz?mp=/1' },
        { name: 'Jazz FM', url: 'http://jazz-wr04.ice.infomaniak.ch/jazz-wr04-128.mp3' },
        { name: 'Classical KUSC', url: 'https://kusc.streamguys1.com/kusc-aac' },
        { name: 'Chillout Lounge', url: 'http://188.165.212.154:8478/stream' },
        { name: 'Smooth Jazz', url: 'http://us4.internet-radio.com:8266/stream' },
        { name: 'Ambient Sleep', url: 'http://uk2.internet-radio.com:8171/stream' }
    ];

    class StationSelectorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Station Selector");
            this.changeCallback = changeCallback;
            this.width = 180;
            this.height = 120;

            this.properties = {
                stations: [...DEFAULT_STATIONS],
                selectedStation: 0
            };

            // Input - allows automation to set station by number
            this.addInput('stationNum', new ClassicPreset.Input(sockets.number, 'Station #'));

            // Single output - wire this to Audio Output's 📻 input for any speaker
            this.addOutput('station', new ClassicPreset.Output(sockets.number, 'Station'));
        }

        data(inputs) {
            // If station number input is connected, use it
            const stationNumInput = inputs.stationNum?.[0];
            if (stationNumInput !== undefined && stationNumInput !== null) {
                const idx = Math.max(0, Math.min(this.properties.stations.length - 1, Math.floor(stationNumInput)));
                if (idx !== this.properties.selectedStation) {
                    this.properties.selectedStation = idx;
                }
            }

            return {
                station: this.properties.selectedStation
            };
        }

        serialize() {
            return {
                stations: this.properties.stations,
                selectedStation: this.properties.selectedStation
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.stations !== undefined) this.properties.stations = props.stations;
            if (props.selectedStation !== undefined) this.properties.selectedStation = props.selectedStation;
        }
    }

    function StationSelectorComponent({ data, emit }) {
        const [stations, setStations] = useState(data.properties.stations || [...DEFAULT_STATIONS]);
        const [selectedStation, setSelectedStation] = useState(data.properties.selectedStation || 0);
        
        const THEME = window.T2Controls?.THEME || {
            surface: '#1e2530',
            text: '#e0e0e0',
            textMuted: '#888',
            border: 'rgba(95, 179, 179, 0.3)'
        };

        // Sync stations from Audio Output's global registry
        useEffect(() => {
            const checkStations = () => {
                if (window.T2StationRegistry?.stations?.length > 0) {
                    const registryStations = window.T2StationRegistry.stations;
                    if (JSON.stringify(stations) !== JSON.stringify(registryStations)) {
                        setStations(registryStations);
                        data.properties.stations = registryStations;
                    }
                }
            };
            checkStations();
            const interval = setInterval(checkStations, 2000);
            return () => clearInterval(interval);
        }, [stations]);

        const handleStationChange = (e) => {
            const idx = parseInt(e.target.value, 10);
            setSelectedStation(idx);
            data.properties.selectedStation = idx;
            if (data.changeCallback) data.changeCallback();
        };

        const outputs = Object.entries(data.outputs || {});

        return el('div', { 
            style: { 
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                border: `2px solid ${THEME.border}`,
                borderRadius: '8px',
                padding: '10px',
                minWidth: '180px',
                color: THEME.text
            } 
        }, [
            // Header
            el('div', { 
                key: 'header', 
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    marginBottom: '8px',
                    borderBottom: `1px solid ${THEME.border}`,
                    paddingBottom: '6px'
                } 
            }, [
                el('span', { key: 'icon' }, '📻'),
                el('span', { key: 'title', style: { fontWeight: '600', fontSize: '12px' } }, 'Station')
            ]),

            // Input socket (Station #)
            el('div', { 
                key: 'inputs', 
                style: { 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: '4px',
                    marginBottom: '6px'
                } 
            }, Object.entries(data.inputs || {}).map(([key, input]) =>
                el('div', { 
                    key, 
                    style: { display: 'flex', alignItems: 'center', gap: '4px' } 
                }, [
                    el(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ 
                            type: 'render', 
                            data: { 
                                type: 'socket', 
                                side: 'input', 
                                key, 
                                nodeId: data.id, 
                                element: ref, 
                                payload: input.socket 
                            } 
                        })
                    }),
                    el('span', { 
                        key: 'label', 
                        style: { fontSize: '10px', color: THEME.textMuted } 
                    }, input.label || key)
                ])
            )),

            // Station dropdown - shows number prefix for each station
            el('select', {
                key: 'select',
                value: selectedStation,
                onChange: handleStationChange,
                onPointerDown: (e) => e.stopPropagation(),
                style: {
                    width: '100%',
                    padding: '6px',
                    borderRadius: '4px',
                    border: `1px solid ${THEME.border}`,
                    background: THEME.surface,
                    color: THEME.text,
                    fontSize: '11px',
                    marginBottom: '8px'
                }
            }, stations.map((s, i) => el('option', { key: i, value: i }, `${i}: ${s.name}`))),

            // Output socket
            el('div', { 
                key: 'outputs', 
                style: { 
                    display: 'flex', 
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '4px'
                } 
            }, outputs.map(([key, output]) =>
                el('div', { 
                    key, 
                    style: { display: 'flex', alignItems: 'center', gap: '4px' } 
                }, [
                    el('span', { 
                        key: 'label', 
                        style: { fontSize: '10px', color: THEME.textMuted } 
                    }, output.label || key),
                    el(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ 
                            type: 'render', 
                            data: { 
                                type: 'socket', 
                                side: 'output', 
                                key, 
                                nodeId: data.id, 
                                element: ref, 
                                payload: output.socket 
                            } 
                        })
                    })
                ])
            ))
        ]);
    }

    if (window.nodeRegistry) {
        window.nodeRegistry.register('StationSelectorNode', {
            label: "Station Selector",
            category: "Media",
            nodeClass: StationSelectorNode,
            component: StationSelectorComponent,
            factory: (cb) => new StationSelectorNode(cb)
        });
        console.log('[StationSelectorNode] ✅ Registered');
    }

})();
