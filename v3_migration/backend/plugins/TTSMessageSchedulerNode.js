/**
 * TTSMessageSchedulerNode.js
 * 
 * A compact way to trigger TTS messages based on boolean inputs.
 * Each message row has:
 *   - A trigger input socket (fires on rising edge only)
 *   - A text input field for the message
 *   - A test button to preview the message
 * 
 * Messages are queued and sent one at a time with a delay between them.
 * Connect the output to Event Announcer's Priority Message input.
 */

(function() {
    'use strict';

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.warn('[TTSMessageSchedulerNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const sockets = window.sockets;
    const el = React.createElement;
    const RefComponent = window.RefComponent;

    // Default messages
    const DEFAULT_MESSAGES = [
        { text: 'Message 1', enabled: true },
        { text: 'Message 2', enabled: true },
        { text: 'Message 3', enabled: true }
    ];

    // Delay between queued messages (ms)
    const MESSAGE_DELAY = 3000;

    class TTSMessageSchedulerNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("TTS Message Scheduler");
            this.changeCallback = changeCallback;
            this.width = 360;
            this.height = 280;

            this.properties = {
                messages: [...DEFAULT_MESSAGES],
                lastTriggeredIndex: null,
                lastTriggeredText: null,
                debug: false
            };

            // Track last input states for edge detection (per trigger)
            this._lastInputStates = {};
            
            // Settling delay - prevent false triggers on graph load
            this._initTime = Date.now();
            this._settlingMs = 2000; // 2 second settling period
            
            // Message queue
            this._messageQueue = [];
            this._isProcessingQueue = false;
            
            // Current output message (null when idle)
            this._currentOutputMessage = null;

            // Create initial trigger inputs
            this._rebuildSockets();

            // Output - connect to Event Announcer Priority Message
            this.addOutput('message', new ClassicPreset.Output(sockets.any, 'Message'));
        }

        _rebuildSockets() {
            // Remove existing trigger inputs
            const existingInputs = Object.keys(this.inputs).filter(k => k.startsWith('trigger_'));
            existingInputs.forEach(key => this.removeInput(key));

            // Create trigger inputs for each message
            this.properties.messages.forEach((msg, index) => {
                this.addInput(
                    `trigger_${index}`,
                    new ClassicPreset.Input(sockets.boolean, `#${index + 1}`)
                );
            });
        }

        toBoolean(value) {
            if (value === null || value === undefined) return false;
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value === 'string') {
                const lower = value.toLowerCase().trim();
                return lower === 'true' || lower === 'on' || lower === '1' || lower === 'yes';
            }
            return !!value;
        }

        queueMessage(index, text) {
            if (this.properties.debug) {
                console.log(`[TTSMessageScheduler] Queuing message ${index + 1}: "${text}"`);
            }
            this._messageQueue.push({ index, text });
            this._processQueue();
        }

        _processQueue() {
            console.log(`[TTSMessageScheduler] _processQueue called: isProcessing=${this._isProcessingQueue}, queueLength=${this._messageQueue.length}`);
            
            if (this._isProcessingQueue || this._messageQueue.length === 0) {
                console.log(`[TTSMessageScheduler] _processQueue returning early (isProcessing=${this._isProcessingQueue}, queueEmpty=${this._messageQueue.length === 0})`);
                return;
            }
            
            this._isProcessingQueue = true;
            const { index, text } = this._messageQueue.shift();
            
            this._currentOutputMessage = text;
            this.properties.lastTriggeredIndex = index;
            this.properties.lastTriggeredText = text;
            
            console.log(`[TTSMessageScheduler] 📢 Sending message #${index + 1}: "${text.substring(0, 30)}..."`);
            
            if (this.changeCallback) {
                console.log(`[TTSMessageScheduler] Calling changeCallback to trigger engine...`);
                this.changeCallback();
            } else {
                console.log(`[TTSMessageScheduler] ⚠️ No changeCallback!`);
            }
            
            setTimeout(() => {
                console.log(`[TTSMessageScheduler] Clearing _currentOutputMessage after 500ms`);
                this._currentOutputMessage = null;
                if (this.changeCallback) this.changeCallback();
                
                setTimeout(() => {
                    console.log(`[TTSMessageScheduler] Queue processing complete, ready for next message`);
                    this._isProcessingQueue = false;
                    this._processQueue();
                }, MESSAGE_DELAY);
            }, 500);
        }

        testMessage(index) {
            console.log(`[TTSMessageScheduler] 🔘 Test button clicked for message #${index + 1}`);
            const msg = this.properties.messages[index];
            if (msg && msg.text) {
                // Debounce test button - prevent double-clicks from queuing twice
                const now = Date.now();
                const lastTestTime = this._lastTestTime || 0;
                const lastTestIndex = this._lastTestIndex;
                
                if (index === lastTestIndex && (now - lastTestTime) < 3000) {
                    console.log(`[TTSMessageScheduler] ⚠️ Test button debounce: message #${index + 1} clicked ${Math.round((now - lastTestTime)/1000)}s ago, ignoring`);
                    return;
                }
                
                this._lastTestTime = now;
                this._lastTestIndex = index;
                console.log(`[TTSMessageScheduler] ✅ Queuing message: "${msg.text.substring(0, 30)}..."`);
                this.queueMessage(index, msg.text);
            } else {
                console.log(`[TTSMessageScheduler] ⚠️ No message found at index ${index}`);
            }
        }

        addMessage() {
            const newIndex = this.properties.messages.length;
            this.properties.messages.push({ 
                text: `Message ${newIndex + 1}`, 
                enabled: true 
            });
            this.addInput(
                `trigger_${newIndex}`,
                new ClassicPreset.Input(sockets.boolean, `#${newIndex + 1}`)
            );
            if (this.changeCallback) this.changeCallback();
        }

        removeMessage() {
            if (this.properties.messages.length <= 1) return;
            
            const lastIndex = this.properties.messages.length - 1;
            this.properties.messages.pop();
            this.removeInput(`trigger_${lastIndex}`);
            delete this._lastInputStates[lastIndex];
            
            if (this.changeCallback) this.changeCallback();
        }

        updateMessageText(index, text) {
            if (this.properties.messages[index]) {
                this.properties.messages[index].text = text;
            }
        }

        data(inputs) {
            // Check if we're still in settling period (prevent false triggers on graph load)
            const isSettling = (Date.now() - this._initTime) < this._settlingMs;
            
            // Debug: log all input states
            const inputStates = this.properties.messages.map((msg, index) => {
                const triggerKey = `trigger_${index}`;
                const rawInput = inputs[triggerKey]?.[0];
                return `#${index + 1}=${this.toBoolean(rawInput)}`;
            }).join(', ');
            
            // Only log when there's activity (at least one true input)
            if (inputStates.includes('true')) {
                console.log(`[TTSMessageScheduler] data() called: inputs=[${inputStates}], settling=${isSettling}`);
            }
            
            this.properties.messages.forEach((msg, index) => {
                const triggerKey = `trigger_${index}`;
                const rawInput = inputs[triggerKey]?.[0];
                const currentState = this.toBoolean(rawInput);
                const lastState = this._lastInputStates[index] ?? false;
                
                if (!lastState && currentState) {
                    if (isSettling) {
                        // During settling, just record state without triggering
                        console.log(`[TTSMessageScheduler] ⏳ Settling: skipping initial trigger for message #${index + 1}`);
                    } else if (msg.enabled && msg.text) {
                        console.log(`[TTSMessageScheduler] 🔔 Rising edge detected on trigger #${index + 1}, queuing: "${msg.text.substring(0, 30)}..."`);
                        this.queueMessage(index, msg.text);
                    }
                }
                this._lastInputStates[index] = currentState;
            });

            return { message: this._currentOutputMessage };
        }

        serialize() {
            return {
                messages: this.properties.messages,
                debug: this.properties.debug
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.messages !== undefined) {
                this.properties.messages = props.messages;
                this._rebuildSockets();
            }
            if (props.debug !== undefined) this.properties.debug = props.debug;
        }

        destroy() {
            this._messageQueue = [];
            this._isProcessingQueue = false;
        }
    }

    // =========================================================================
    // REACT COMPONENT - follows StationScheduleNode pattern
    // =========================================================================

    function TTSMessageSchedulerComponent({ data, emit }) {
        const [messages, setMessages] = useState(data.properties.messages || [...DEFAULT_MESSAGES]);
        const [lastTriggered, setLastTriggered] = useState(data.properties.lastTriggeredText || null);
        const [, forceUpdate] = useState(0);

        // Get shared theme (same as StationScheduleNode)
        const THEME = window.T2Controls?.THEME || {
            surface: '#1e2530',
            surfaceLight: '#2a3441',
            text: '#e0e0e0',
            textMuted: '#888',
            border: 'rgba(95, 179, 179, 0.3)',
            accent: '#5fb3b3',
            danger: '#e06c75',
            success: '#4caf50'
        };

        // Sync with node properties
        useEffect(() => {
            const interval = setInterval(() => {
                if (JSON.stringify(data.properties.messages) !== JSON.stringify(messages)) {
                    setMessages([...data.properties.messages]);
                }
                if (data.properties.lastTriggeredText !== lastTriggered) {
                    setLastTriggered(data.properties.lastTriggeredText);
                }
            }, 500);
            return () => clearInterval(interval);
        }, [messages, lastTriggered]);

        const handleTextChange = useCallback((index, text) => {
            data.updateMessageText(index, text);
            const updated = [...messages];
            updated[index] = { ...updated[index], text };
            setMessages(updated);
        }, [messages, data]);

        const handleTest = useCallback((index) => {
            data.testMessage(index);
        }, [data]);

        const handleAddMessage = useCallback(() => {
            data.addMessage();
            setMessages([...data.properties.messages]);
            forceUpdate(f => f + 1);
        }, [data]);

        const handleRemoveMessage = useCallback(() => {
            data.removeMessage();
            setMessages([...data.properties.messages]);
            forceUpdate(f => f + 1);
        }, [data]);

        // Get inputs and outputs for socket rendering
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        return el('div', { 
            className: 'tts-scheduler-node node-bg-gradient',
            style: { 
                border: `2px solid ${THEME.border}`,
                borderRadius: '8px',
                padding: '10px',
                width: '360px',
                color: THEME.text,
                fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                fontSize: '11px'
            } 
        }, [
            // Header
            el('div', { 
                key: 'header', 
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    borderBottom: `1px solid ${THEME.border}`,
                    paddingBottom: '6px'
                } 
            }, [
                el('div', { key: 'title-area', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                    el('span', { key: 'icon' }, '📢'),
                    el('span', { key: 'title', style: { fontWeight: '600', fontSize: '12px' } }, 'TTS Message Scheduler')
                ]),
                el('div', { 
                    key: 'count', 
                    style: { 
                        fontSize: '10px', 
                        color: THEME.textMuted,
                        background: THEME.surface,
                        padding: '2px 6px',
                        borderRadius: '4px'
                    } 
                }, `${messages.length} msgs`)
            ]),

            // Message rows with inline trigger sockets
            el('div', { 
                key: 'messages',
                style: { 
                    maxHeight: '180px', 
                    overflowY: 'auto',
                    marginBottom: '8px',
                    paddingRight: '4px'
                },
                onPointerDown: (e) => e.stopPropagation(),
                onWheel: (e) => e.stopPropagation()
            }, messages.map((msg, index) => {
                const inputKey = `trigger_${index}`;
                const input = data.inputs?.[inputKey];
                
                return el('div', { 
                    key: `msg_${index}`, 
                    style: { 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        marginBottom: '4px',
                        padding: '4px',
                        background: THEME.surface,
                        borderRadius: '4px',
                        border: `1px solid ${THEME.border}`
                    } 
                }, [
                    // Trigger socket
                    input && el(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ 
                            type: 'render', 
                            data: { 
                                type: 'socket', 
                                side: 'input', 
                                key: inputKey, 
                                nodeId: data.id, 
                                element: ref, 
                                payload: input.socket 
                            } 
                        })
                    }),
                    // Row number
                    el('span', { 
                        key: 'num', 
                        style: { 
                            fontSize: '10px', 
                            color: THEME.textMuted,
                            minWidth: '18px'
                        } 
                    }, `#${index + 1}`),
                    // Text input
                    el('input', {
                        key: 'input',
                        type: 'text',
                        value: msg.text,
                        placeholder: 'Enter message...',
                        onChange: (e) => handleTextChange(index, e.target.value),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: `1px solid ${THEME.border}`,
                            background: '#0d1117',
                            color: THEME.text,
                            fontSize: '11px',
                            outline: 'none'
                        }
                    }),
                    // Test button
                    el('button', {
                        key: 'test',
                        onClick: () => handleTest(index),
                        onPointerDown: (e) => e.stopPropagation(),
                        title: 'Test this message',
                        style: {
                            padding: '4px 8px',
                            background: 'rgba(33, 150, 243, 0.2)',
                            border: `1px solid rgba(33, 150, 243, 0.4)`,
                            borderRadius: '4px',
                            color: '#2196f3',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }
                    }, '🔊')
                ]);
            })),

            // Add/Remove buttons
            el('div', { 
                key: 'actions',
                style: { display: 'flex', gap: '6px', marginBottom: '8px' }
            }, [
                el('button', {
                    key: 'add',
                    onClick: handleAddMessage,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        flex: 1,
                        padding: '6px',
                        borderRadius: '4px',
                        border: `1px dashed ${THEME.success}`,
                        background: 'rgba(76, 175, 80, 0.1)',
                        color: THEME.success,
                        fontSize: '11px',
                        cursor: 'pointer'
                    }
                }, '+ Add Message'),
                el('button', {
                    key: 'remove',
                    onClick: handleRemoveMessage,
                    onPointerDown: (e) => e.stopPropagation(),
                    disabled: messages.length <= 1,
                    style: {
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: `1px solid ${messages.length > 1 ? THEME.danger : THEME.border}`,
                        background: messages.length > 1 ? 'rgba(224, 108, 117, 0.1)' : 'transparent',
                        color: messages.length > 1 ? THEME.danger : THEME.textMuted,
                        fontSize: '11px',
                        cursor: messages.length > 1 ? 'pointer' : 'not-allowed',
                        opacity: messages.length > 1 ? 1 : 0.5
                    }
                }, '−')
            ]),

            // Last triggered status
            lastTriggered && el('div', { 
                key: 'status',
                style: {
                    padding: '6px 8px',
                    background: 'rgba(76, 175, 80, 0.15)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: THEME.success,
                    borderLeft: `3px solid ${THEME.success}`,
                    marginBottom: '8px'
                }
            }, [
                el('span', { key: 'label', style: { fontWeight: 'bold' } }, 'Last: '),
                el('span', { key: 'text' }, lastTriggered)
            ]),

            // Output socket
            el('div', { 
                key: 'outputs', 
                style: { 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '6px',
                    borderTop: `1px solid ${THEME.border}`,
                    paddingTop: '8px'
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

    // =========================================================================
    // REGISTER NODE
    // =========================================================================

    if (window.nodeRegistry) {
        window.nodeRegistry.register('TTSMessageSchedulerNode', {
            label: 'TTS Message Scheduler',
            category: 'Timer/Event',
            nodeClass: TTSMessageSchedulerNode,
            component: TTSMessageSchedulerComponent,
            factory: (changeCallback) => new TTSMessageSchedulerNode(changeCallback)
        });
        console.log('[TTSMessageSchedulerNode] ✅ Registered');
    } else {
        console.error('[TTSMessageSchedulerNode] nodeRegistry not found!');
    }

})();
