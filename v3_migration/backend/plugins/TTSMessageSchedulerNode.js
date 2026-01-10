/**
 * TTSMessageSchedulerNode.js
 * 
 * A compact way to trigger TTS messages based on boolean inputs OR scheduled times.
 * Each message row has:
 *   - A trigger input socket (fires on rising edge) - for automation triggers
 *   - A text override input socket - overrides the text field when connected
 *   - A text input field for the message (used if no override connected)
 *   - An optional schedule time (triggers at specific time daily)
 *   - A test button to preview the message
 * 
 * Messages are queued and sent one at a time with a delay between them.
 * Connect the output to Event Announcer's Priority Message input.
 * 
 * v2.1.212: Added text override sockets and time-based scheduling
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
        { text: 'Message 1', enabled: true, scheduleTime: '', useSchedule: false },
        { text: 'Message 2', enabled: true, scheduleTime: '', useSchedule: false },
        { text: 'Message 3', enabled: true, scheduleTime: '', useSchedule: false }
    ];

    // Delay between queued messages (ms)
    const MESSAGE_DELAY = 3000;

    class TTSMessageSchedulerNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("TTS Message Scheduler");
            this.changeCallback = changeCallback;
            this.width = 420;
            this.height = 320;

            this.properties = {
                messages: [...DEFAULT_MESSAGES],
                lastTriggeredIndex: null,
                lastTriggeredText: null,
                debug: false
            };

            // Dynamic height calculation
            this._updateHeight();

            // Track last input states for edge detection (per trigger)
            this._lastInputStates = {};
            
            // Track last schedule states (for edge detection on time triggers)
            this._lastScheduleStates = {};
            
            // Settling delay - prevent false triggers on graph load
            this._initTime = Date.now();
            this._settlingMs = 2000; // 2 second settling period
            
            // Message queue
            this._messageQueue = [];
            this._isProcessingQueue = false;
            
            // Current output message (null when idle)
            this._currentOutputMessage = null;

            // Store last received text overrides (from connected nodes)
            this._textOverrides = {};

            // Create initial sockets
            this._rebuildSockets();

            // Output - connect to Event Announcer Priority Message
            this.addOutput('message', new ClassicPreset.Output(sockets.any, 'Message'));
        }

        _updateHeight() {
            // Base height for header, buttons, legend, output
            const BASE_HEIGHT = 180;
            // Height per message row (2-line layout)
            const HEIGHT_PER_MESSAGE = 72;
            this.height = BASE_HEIGHT + (this.properties.messages.length * HEIGHT_PER_MESSAGE);
        }

        _rebuildSockets() {
            // Remove existing inputs
            const existingInputs = Object.keys(this.inputs).filter(k => 
                k.startsWith('trigger_') || k.startsWith('text_')
            );
            existingInputs.forEach(key => this.removeInput(key));

            // Create inputs for each message
            this.properties.messages.forEach((msg, index) => {
                // Trigger input socket
                this.addInput(
                    `trigger_${index}`,
                    new ClassicPreset.Input(sockets.boolean, `#${index + 1}`)
                );
                // Text override input socket
                this.addInput(
                    `text_${index}`,
                    new ClassicPreset.Input(sockets.any, `Text`)
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

        /**
         * Check if current time matches a schedule time (HH:MM format)
         * Uses minute-level precision with edge detection
         */
        isScheduleTimeNow(scheduleTime) {
            if (!scheduleTime) return false;
            
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            return currentTime === scheduleTime;
        }

        queueMessage(index, text) {
            if (this.properties.debug) {
                console.log(`[TTSMessageScheduler] Queuing message ${index + 1}: "${text}"`);
            }
            this._messageQueue.push({ index, text });
            this._processQueue();
        }

        _processQueue() {
            if (this.properties.debug) {
                console.log(`[TTSMessageScheduler] _processQueue called: isProcessing=${this._isProcessingQueue}, queueLength=${this._messageQueue.length}`);
            }
            
            if (this._isProcessingQueue || this._messageQueue.length === 0) {
                return;
            }
            
            this._isProcessingQueue = true;
            const { index, text } = this._messageQueue.shift();
            
            this._currentOutputMessage = text;
            this.properties.lastTriggeredIndex = index;
            this.properties.lastTriggeredText = text;
            
            console.log(`[TTSMessageScheduler] 📢 Sending message #${index + 1}: "${text.substring(0, 50)}..."`);
            
            if (this.changeCallback) {
                this.changeCallback();
            }
            
            setTimeout(() => {
                this._currentOutputMessage = null;
                if (this.changeCallback) this.changeCallback();
                
                setTimeout(() => {
                    this._isProcessingQueue = false;
                    this._processQueue();
                }, MESSAGE_DELAY);
            }, 500);
        }

        testMessage(index, overrideText = null) {
            console.log(`[TTSMessageScheduler] 🔘 Test button clicked for message #${index + 1}`);
            const msg = this.properties.messages[index];
            // Priority: explicit override > connected socket override > message text field
            const textToUse = overrideText || this._textOverrides?.[index] || (msg && msg.text);
            
            if (textToUse) {
                // Debounce test button
                const now = Date.now();
                const lastTestTime = this._lastTestTime || 0;
                const lastTestIndex = this._lastTestIndex;
                
                if (index === lastTestIndex && (now - lastTestTime) < 3000) {
                    console.log(`[TTSMessageScheduler] ⚠️ Debounce: message #${index + 1} clicked ${Math.round((now - lastTestTime)/1000)}s ago`);
                    return;
                }
                
                this._lastTestTime = now;
                this._lastTestIndex = index;
                console.log(`[TTSMessageScheduler] ✅ Queuing: "${textToUse.substring(0, 50)}..."`);
                this.queueMessage(index, textToUse);
            }
        }

        addMessage() {
            const newIndex = this.properties.messages.length;
            this.properties.messages.push({ 
                text: `Message ${newIndex + 1}`, 
                enabled: true,
                scheduleTime: '',
                useSchedule: false
            });
            // Add both trigger and text override sockets
            this.addInput(
                `trigger_${newIndex}`,
                new ClassicPreset.Input(sockets.boolean, `#${newIndex + 1}`)
            );
            this.addInput(
                `text_${newIndex}`,
                new ClassicPreset.Input(sockets.any, `Text`)
            );
            this._updateHeight();
            if (this.changeCallback) this.changeCallback();
        }

        removeMessage() {
            if (this.properties.messages.length <= 1) return;
            
            const lastIndex = this.properties.messages.length - 1;
            this.properties.messages.pop();
            this.removeInput(`trigger_${lastIndex}`);
            this.removeInput(`text_${lastIndex}`);
            delete this._lastInputStates[lastIndex];
            delete this._lastScheduleStates[lastIndex];
            delete this._textOverrides[lastIndex];
            
            this._updateHeight();
            if (this.changeCallback) this.changeCallback();
        }

        removeMessageAt(index) {
            if (this.properties.messages.length <= 1) return;
            if (index < 0 || index >= this.properties.messages.length) return;
            
            // Remove the message at index
            this.properties.messages.splice(index, 1);
            
            // Rebuild all sockets (simpler than renumbering)
            this._rebuildSockets();
            
            // Clear tracking for removed/shifted indices
            this._lastInputStates = {};
            this._lastScheduleStates = {};
            this._textOverrides = {};
            
            this._updateHeight();
            if (this.changeCallback) this.changeCallback();
        }

        updateMessageText(index, text) {
            if (this.properties.messages[index]) {
                this.properties.messages[index].text = text;
            }
        }

        updateMessageSchedule(index, scheduleTime) {
            if (this.properties.messages[index]) {
                this.properties.messages[index].scheduleTime = scheduleTime;
                this.properties.messages[index].useSchedule = !!scheduleTime;
            }
        }

        data(inputs) {
            // Check if we're still in settling period
            const isSettling = (Date.now() - this._initTime) < this._settlingMs;
            
            this.properties.messages.forEach((msg, index) => {
                // --- Text Override Check ---
                const textOverrideKey = `text_${index}`;
                const textOverride = inputs[textOverrideKey]?.[0];
                
                // Store the text override so Test button and UI can access it
                if (textOverride !== undefined && textOverride !== null && textOverride !== '') {
                    this._textOverrides[index] = String(textOverride);
                } else {
                    delete this._textOverrides[index];
                }
                
                const messageText = this._textOverrides[index] ?? msg.text;
                
                // --- Socket Trigger Check (rising edge) ---
                const triggerKey = `trigger_${index}`;
                const rawInput = inputs[triggerKey]?.[0];
                const currentTriggerState = this.toBoolean(rawInput);
                const lastTriggerState = this._lastInputStates[index] ?? false;
                
                const socketTriggered = !lastTriggerState && currentTriggerState;
                this._lastInputStates[index] = currentTriggerState;
                
                // --- Schedule Trigger Check (time-based rising edge) ---
                let scheduleTriggered = false;
                if (msg.useSchedule && msg.scheduleTime) {
                    const isTimeNow = this.isScheduleTimeNow(msg.scheduleTime);
                    const wasTimeActive = this._lastScheduleStates[index] ?? false;
                    
                    // Rising edge: wasn't active before, is now
                    scheduleTriggered = !wasTimeActive && isTimeNow;
                    this._lastScheduleStates[index] = isTimeNow;
                }
                
                // --- Trigger Message ---
                if (socketTriggered || scheduleTriggered) {
                    if (isSettling) {
                        if (this.properties.debug) {
                            console.log(`[TTSMessageScheduler] ⏳ Settling: skipping trigger for #${index + 1}`);
                        }
                    } else if (msg.enabled && messageText) {
                        const triggerType = socketTriggered ? 'socket' : 'schedule';
                        console.log(`[TTSMessageScheduler] 🔔 Triggered (#${index + 1} via ${triggerType}): "${messageText.substring(0, 50)}..."`);
                        this.queueMessage(index, messageText);
                    }
                }
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
                // Ensure all messages have the new properties
                this.properties.messages = props.messages.map(msg => ({
                    text: msg.text || '',
                    enabled: msg.enabled !== false,
                    scheduleTime: msg.scheduleTime || '',
                    useSchedule: msg.useSchedule || false
                }));
                this._rebuildSockets();
                this._updateHeight();
            }
            if (props.debug !== undefined) this.properties.debug = props.debug;
        }

        destroy() {
            this._messageQueue = [];
            this._isProcessingQueue = false;
        }
    }

    // =========================================================================
    // REACT COMPONENT
    // =========================================================================

    function TTSMessageSchedulerComponent({ data, emit }) {
        const [messages, setMessages] = useState(data.properties.messages || [...DEFAULT_MESSAGES]);
        const [lastTriggered, setLastTriggered] = useState(data.properties.lastTriggeredText || null);
        const [textOverrides, setTextOverrides] = useState({});
        const [, forceUpdate] = useState(0);

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

        // Sync with node properties and text overrides
        useEffect(() => {
            const interval = setInterval(() => {
                if (JSON.stringify(data.properties.messages) !== JSON.stringify(messages)) {
                    setMessages([...data.properties.messages]);
                }
                if (data.properties.lastTriggeredText !== lastTriggered) {
                    setLastTriggered(data.properties.lastTriggeredText);
                }
                // Sync text overrides from node
                const nodeOverrides = data._textOverrides || {};
                if (JSON.stringify(nodeOverrides) !== JSON.stringify(textOverrides)) {
                    setTextOverrides({...nodeOverrides});
                }
            }, 300);
            return () => clearInterval(interval);
        }, [messages, lastTriggered, textOverrides]);

        const handleTextChange = useCallback((index, text) => {
            data.updateMessageText(index, text);
            const updated = [...messages];
            updated[index] = { ...updated[index], text };
            setMessages(updated);
        }, [messages, data]);

        const handleScheduleChange = useCallback((index, scheduleTime) => {
            data.updateMessageSchedule(index, scheduleTime);
            const updated = [...messages];
            updated[index] = { ...updated[index], scheduleTime, useSchedule: !!scheduleTime };
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

        const handleRemoveMessageAt = useCallback((index) => {
            data.removeMessageAt(index);
            setMessages([...data.properties.messages]);
            setTextOverrides({});
            forceUpdate(f => f + 1);
        }, [data]);

        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        return el('div', { 
            className: 'tts-scheduler-node node-bg-gradient',
            style: { 
                border: `2px solid ${THEME.border}`,
                borderRadius: '8px',
                padding: '10px',
                width: '420px',
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

            // Message rows (no scroll - dynamic height)
            el('div', { 
                key: 'messages',
                style: { 
                    marginBottom: '8px'
                },
                onPointerDown: (e) => e.stopPropagation()
            }, messages.map((msg, index) => {
                const triggerInputKey = `trigger_${index}`;
                const textInputKey = `text_${index}`;
                const triggerInput = data.inputs?.[triggerInputKey];
                const textInput = data.inputs?.[textInputKey];
                
                return el('div', { 
                    key: `msg_${index}`, 
                    style: { 
                        display: 'flex',
                        alignItems: 'stretch', 
                        gap: '6px',
                        marginBottom: '6px',
                        padding: '6px',
                        background: THEME.surface,
                        borderRadius: '4px',
                        border: `1px solid ${THEME.border}`
                    } 
                }, [
                    // Socket column - BOTH sockets on message row (stacked)
                    el('div', { 
                        key: 'sockets', 
                        style: { 
                            display: 'flex', 
                            flexDirection: 'column', 
                            justifyContent: 'flex-start',
                            gap: '4px',
                            paddingRight: '4px',
                            borderRight: `1px solid ${THEME.border}`,
                            paddingTop: '2px'
                        } 
                    }, [
                        // Text override socket (TOP - aligns with message text row)
                        el('div', { 
                            key: 'text-socket', 
                            style: { display: 'flex', alignItems: 'center', height: '18px' },
                            title: 'Text override - connect string/any'
                        }, [
                            textInput && el(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ 
                                    type: 'render', 
                                    data: { 
                                        type: 'socket', 
                                        side: 'input', 
                                        key: textInputKey, 
                                        nodeId: data.id, 
                                        element: ref, 
                                        payload: textInput.socket 
                                    } 
                                })
                            })
                        ]),
                        // Trigger socket (BOTTOM - aligns with time/test row)
                        el('div', { 
                            key: 'trigger-socket', 
                            style: { display: 'flex', alignItems: 'center', height: '18px' },
                            title: 'Trigger (rising edge) - connect boolean'
                        }, [
                            triggerInput && el(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ 
                                    type: 'render', 
                                    data: { 
                                        type: 'socket', 
                                        side: 'input', 
                                        key: triggerInputKey, 
                                        nodeId: data.id, 
                                        element: ref, 
                                        payload: triggerInput.socket 
                                    } 
                                })
                            })
                        ])
                    ]),
                    // Content column
                    el('div', { 
                        key: 'content', 
                        style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' } 
                    }, [
                        // Row 1: Message number + text input (or override display)
                        el('div', { key: 'text-row', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                            el('span', { 
                                key: 'num', 
                                style: { fontSize: '10px', color: THEME.accent, fontWeight: 'bold', minWidth: '20px' } 
                            }, `#${index + 1}`),
                            // Check if there's a text override from connected socket
                            textOverrides[index] 
                                ? // Connected - show override text (readonly, styled)
                                  el('div', {
                                      key: 'override',
                                      title: 'Text from connected input',
                                      style: {
                                          flex: 1,
                                          padding: '4px 6px',
                                          borderRadius: '3px',
                                          border: `1px solid ${THEME.accent}`,
                                          background: 'rgba(95, 179, 179, 0.15)',
                                          color: THEME.accent,
                                          fontSize: '11px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                      }
                                  }, `📥 ${textOverrides[index].substring(0, 60)}${textOverrides[index].length > 60 ? '...' : ''}`)
                                : // Not connected - show editable input
                                  el('input', {
                                      key: 'input',
                                      type: 'text',
                                      value: msg.text,
                                      placeholder: 'Message text...',
                                      onChange: (e) => handleTextChange(index, e.target.value),
                                      onPointerDown: (e) => e.stopPropagation(),
                                      style: {
                                          flex: 1,
                                          padding: '4px 6px',
                                          borderRadius: '3px',
                                          border: `1px solid ${THEME.border}`,
                                          background: '#0d1117',
                                          color: THEME.text,
                                          fontSize: '11px',
                                          outline: 'none'
                                      }
                                  })
                        ]),
                        // Row 2: Schedule time (text input HH:MM) + Test button
                        el('div', { key: 'time-row', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                            el('span', { 
                                key: 'clock', 
                                style: { fontSize: '10px', color: THEME.textMuted } 
                            }, '⏰'),
                            // Native time picker input (like Station Scheduler)
                            el('input', {
                                key: 'schedule',
                                type: 'time',
                                value: msg.scheduleTime || '',
                                onChange: (e) => handleScheduleChange(index, e.target.value),
                                onPointerDown: (e) => e.stopPropagation(),
                                title: 'Daily trigger time - leave empty for socket-only',
                                style: {
                                    width: '85px',
                                    padding: '3px 6px',
                                    borderRadius: '4px',
                                    border: `1px solid ${msg.scheduleTime ? THEME.accent : THEME.border}`,
                                    background: msg.scheduleTime ? 'rgba(95, 179, 179, 0.1)' : THEME.surface,
                                    color: msg.scheduleTime ? THEME.accent : THEME.text,
                                    fontSize: '11px'
                                }
                            }),
                            el('span', { 
                                key: 'helper', 
                                style: { fontSize: '9px', color: THEME.textMuted, flex: 1 } 
                            }, msg.scheduleTime ? 'daily' : '(optional)'),
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
                                    borderRadius: '3px',
                                    color: '#2196f3',
                                    cursor: 'pointer',
                                    fontSize: '11px'
                                }
                            }, '🔊 Test'),
                            // Delete row button (only if more than 1 message)
                            messages.length > 1 && el('button', {
                                key: 'delete',
                                onClick: () => handleRemoveMessageAt(index),
                                onPointerDown: (e) => e.stopPropagation(),
                                title: 'Delete this message',
                                style: {
                                    padding: '4px 6px',
                                    background: 'rgba(224, 108, 117, 0.15)',
                                    border: `1px solid rgba(224, 108, 117, 0.4)`,
                                    borderRadius: '3px',
                                    color: THEME.danger,
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 'bold'
                                }
                            }, '×')
                        ])
                    ])
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

            // Legend/help text
            el('div', {
                key: 'legend',
                style: {
                    fontSize: '9px',
                    color: THEME.textMuted,
                    marginBottom: '6px',
                    padding: '4px 6px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '3px',
                    lineHeight: '1.4'
                }
            }, [
                el('div', { key: 'l1' }, '⚡ Trigger socket = fires on rising edge (FALSE→TRUE)'),
                el('div', { key: 'l2' }, '📝 Text socket = overrides message text when connected'),
                el('div', { key: 'l3' }, '⏰ HH:MM = triggers daily at that time')
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
                el('span', { key: 'text' }, lastTriggered.length > 50 ? lastTriggered.substring(0, 50) + '...' : lastTriggered)
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
        console.log('[TTSMessageSchedulerNode] ✅ Registered v2.1.212');
    } else {
        console.error('[TTSMessageSchedulerNode] nodeRegistry not found!');
    }

})();
