/**
 * UpcomingEventsNode.js (Event Announcer Mode)
 * 
 * Watches scheduled events and triggers a TTS announcement X seconds BEFORE
 * each event fires. Instead of listing all events, it announces each one
 * just before it happens.
 * 
 * Example: "Turning Kitchen Counter Lights on" (announced 5 seconds before event)
 * 
 * Outputs:
 *   - trigger: Boolean pulse when it's time to announce
 *   - message: The announcement text (e.g., "Turning Kitchen Counter Lights on")
 *   - event: The event object that's about to fire
 */
(function() {
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[UpcomingEventsNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;
    const RefComponent = window.RefComponent;

    // Tooltips
    const tooltips = {
        node: "Announces scheduled events AND ad-hoc messages. Connect anything to the 'message' input for priority announcements that jump ahead of the schedule.",
        inputs: {
            message: "Ad-hoc message input - when this changes, it's announced IMMEDIATELY (priority over scheduled events)"
        },
        outputs: {
            trigger: "Boolean pulse - true when announcing, then false",
            message: "The announcement text (scheduled or ad-hoc)",
            event: "The event object (null for ad-hoc messages)"
        },
        controls: {
            leadTime: "How many seconds before scheduled events to announce",
            template: "Customize the announcement wording for scheduled events"
        }
    };

    class UpcomingEventsNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Event Announcer");
            this.changeCallback = changeCallback;
            this.width = 300;
            this.height = 340;  // Increased for input socket section

            this.properties = {
                leadTime: 5,           // Seconds before event to announce
                template: 'action',    // 'action' = "Turning X on", 'passive' = "X is turning on"
                announcedEvents: {},   // Track which events we've announced (by unique key)
                currentMessage: '',    // Current announcement message
                currentEvent: null,    // Current event being announced
                triggerActive: false,  // Whether trigger is currently firing
                upcomingCount: 0,      // Number of upcoming events
                // Ad-hoc message tracking
                lastAdHocMessage: '',  // Last ad-hoc message we announced
                previousAdHocInput: undefined, // Previous input state (for edge detection)
                adHocCooldownUntil: 0, // Timestamp when cooldown ends
                isAdHocActive: false,  // True when currently announcing ad-hoc message
                debug: true            // Enable debug logging (TEMP)
            };

            // Input for ad-hoc messages
            this.addInput('message', new ClassicPreset.Input(sockets.any, 'Message'));
            
            // Outputs
            this.addOutput('trigger', new ClassicPreset.Output(sockets.boolean, 'Trigger'));
            this.addOutput('messageOut', new ClassicPreset.Output(sockets.any, 'Message'));
            this.addOutput('event', new ClassicPreset.Output(sockets.any, 'Event'));
            
            // Backend events cache (populated via socket)
            this._backendEvents = [];
        }

        // Set backend events (called from component when socket receives events)
        setBackendEvents(events) {
            this._backendEvents = events || [];
        }

        // Generate unique key for an event (to track if we've announced it)
        getEventKey(event) {
            // Combine device, action, and time to create unique key
            return `${event.deviceName || event.nodeId}_${event.action}_${new Date(event.time).getTime()}`;
        }

        // Generate the announcement message
        generateMessage(event, template) {
            const deviceName = event.deviceName || event.label || 'Unknown device';
            const action = event.action || 'activate';
            
            // Convert action to spoken form
            let actionWord;
            if (action === 'on') {
                actionWord = template === 'action' ? 'Turning on' : 'is turning on';
            } else if (action === 'off') {
                actionWord = template === 'action' ? 'Turning off' : 'is turning off';
            } else {
                // Custom action
                actionWord = template === 'action' ? action : `is ${action}`;
            }
            
            if (template === 'action') {
                return `${actionWord} ${deviceName}`;
            } else {
                return `${deviceName} ${actionWord}`;
            }
        }

        // Check if any event should be announced NOW
        checkAndAnnounce() {
            // Get events from both frontend registry AND backend
            const frontendEvents = (window.getUpcomingEvents && window.getUpcomingEvents()) || [];
            const backendEvents = this._backendEvents || [];
            
            // Debug: log event counts
            if (this.properties.debug) {
                console.log(`[EventAnnouncer] checkAndAnnounce: frontend=${frontendEvents.length}, backend=${backendEvents.length}, isAdHocActive=${this.properties.isAdHocActive}`);
            }
            
            // Merge and deduplicate events (prefer by time)
            const eventMap = new Map();
            [...frontendEvents, ...backendEvents].forEach(e => {
                if (e && e.time) {
                    const key = this.getEventKey(e);
                    if (!eventMap.has(key)) {
                        eventMap.set(key, e);
                    }
                }
            });
            
            const events = Array.from(eventMap.values())
                .sort((a, b) => new Date(a.time) - new Date(b.time));
            
            const now = Date.now();
            const leadMs = this.properties.leadTime * 1000;
            
            // Update count
            this.properties.upcomingCount = events.length;
            
            // If in ad-hoc cooldown, skip scheduled announcements
            if (now < this.properties.adHocCooldownUntil) {
                if (this.properties.debug) {
                    console.log(`[EventAnnouncer] In ad-hoc cooldown, skipping scheduled. Cooldown ends in ${(this.properties.adHocCooldownUntil - now) / 1000}s`);
                }
                return null; // Still in cooldown from ad-hoc message
            }
            this.properties.isAdHocActive = false; // Cooldown over
            
            // Find events that are within our lead time window
            for (const event of events) {
                if (!event.time) continue;
                
                const eventTime = new Date(event.time).getTime();
                const timeUntil = eventTime - now;
                
                // Is this event within our announcement window? (leadTime seconds before, up until it fires)
                if (timeUntil > 0 && timeUntil <= leadMs) {
                    const key = this.getEventKey(event);
                    
                    if (this.properties.debug) {
                        console.log(`[EventAnnouncer] Event in window: ${key}, timeUntil=${timeUntil}ms, announced=${!!this.properties.announcedEvents[key]}`);
                    }
                    
                    // Have we already announced this specific event?
                    if (!this.properties.announcedEvents[key]) {
                        // Mark as announced
                        this.properties.announcedEvents[key] = true;
                        
                        // Generate and store the message
                        this.properties.currentMessage = this.generateMessage(event, this.properties.template);
                        this.properties.currentEvent = event;
                        this.properties.triggerActive = true;
                        
                        // Clean up old announced events (anything > 1 hour ago)
                        const oneHourAgo = now - 3600000;
                        for (const oldKey of Object.keys(this.properties.announcedEvents)) {
                            const timestamp = parseInt(oldKey.split('_').pop());
                            if (timestamp < oneHourAgo) {
                                delete this.properties.announcedEvents[oldKey];
                            }
                        }
                        
                        return event; // Return the event we're announcing
                    }
                }
            }
            
            // No new announcements - clear the trigger if it was active
            // BUT don't clear if ad-hoc message is currently active (let it finish its pulse)
            if (this.properties.triggerActive && !this.properties.isAdHocActive) {
                this.properties.triggerActive = false;
            }
            
            return null;
        }

        // Check for ad-hoc message and handle it
        checkAdHocMessage(inputMessage) {
            // Unwrap array if needed (Rete passes inputs as arrays)
            const msg = Array.isArray(inputMessage) ? inputMessage[0] : inputMessage;
            const prevInput = this.properties.previousAdHocInput;
            
            // Update previous input tracking
            this.properties.previousAdHocInput = msg;
            
            // Skip if empty, undefined
            if (!msg || typeof msg !== 'string' || msg.trim() === '') return false;
            
            // Detect RISING EDGE: previous was undefined/empty, now has value
            // This allows the same message to trigger again after going back to undefined
            const wasEmpty = !prevInput || prevInput === undefined || prevInput === '';
            if (!wasEmpty) {
                // Input was already a value, not a rising edge
                return false;
            }
            
            // Rising edge detected! New message coming in
            this.properties.lastAdHocMessage = msg;
            this.properties.currentMessage = msg;
            this.properties.currentEvent = null; // No event for ad-hoc
            this.properties.triggerActive = true;
            this.properties.isAdHocActive = true;
            this.properties.adHocCooldownUntil = Date.now() + 3000; // 3 second cooldown
            
            return true; // Announced
        }

        data(inputs) {
            // Check for ad-hoc message input first (priority)
            const adHocMsg = inputs.message;
            if (adHocMsg !== undefined) {
                this.checkAdHocMessage(adHocMsg);
            }
            
            return {
                trigger: this.properties.triggerActive,
                messageOut: this.properties.currentMessage,
                event: this.properties.currentEvent
            };
        }

        serialize() {
            return {
                leadTime: this.properties.leadTime,
                template: this.properties.template
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                if (props.leadTime !== undefined) this.properties.leadTime = props.leadTime;
                if (props.template !== undefined) this.properties.template = props.template;
            }
        }

        destroy() {
            // Nothing to clean up in constructor, cleanup happens in component
        }
    }

    // React Component
    function UpcomingEventsComponent({ data, emit }) {
        const [leadTime, setLeadTime] = useState(data.properties.leadTime || 5);
        const [template, setTemplate] = useState(data.properties.template || 'action');
        const [upcomingCount, setUpcomingCount] = useState(0);
        const [lastAnnouncement, setLastAnnouncement] = useState('');
        const [isTriggered, setIsTriggered] = useState(false);
        const [isAdHoc, setIsAdHoc] = useState(false);  // True when announcing ad-hoc message
        const [nextEvents, setNextEvents] = useState([]);  // Preview of next events
        const intervalRef = useRef(null);
        const backendPollRef = useRef(null);
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Request backend events via socket
        useEffect(() => {
            const socket = window.socket;
            if (!socket) return;

            // Handler for backend events - just store them, display handled in check loop
            const handleBackendEvents = (events) => {
                if (data.setBackendEvents) {
                    data.setBackendEvents(events);
                }
            };

            socket.on('upcoming-events', handleBackendEvents);

            // Request backend events every 5 seconds
            const requestEvents = () => {
                socket.emit('request-upcoming-events');
            };
            requestEvents(); // Request immediately
            backendPollRef.current = setInterval(requestEvents, 5000);

            return () => {
                socket.off('upcoming-events', handleBackendEvents);
                if (backendPollRef.current) {
                    clearInterval(backendPollRef.current);
                }
            };
        }, []);

        // Track last events JSON to avoid unnecessary re-renders
        const lastEventsJsonRef = useRef('[]');
        
        // Main check loop - runs every second
        useEffect(() => {
            const checkEvents = () => {
                const announced = data.checkAndAnnounce();
                
                // Update local state
                setUpcomingCount(data.properties.upcomingCount);
                
                // Update display of next events (merge frontend + backend)
                const frontendEvts = (window.getUpcomingEvents && window.getUpcomingEvents()) || [];
                const backendEvts = data._backendEvents || [];
                const eventMap = new Map();
                [...frontendEvts, ...backendEvts].forEach(e => {
                    if (e && e.time) {
                        const key = `${e.deviceName || ''}_${e.action || ''}_${new Date(e.time).getTime()}`;
                        if (!eventMap.has(key)) eventMap.set(key, e);
                    }
                });
                const mergedEvents = Array.from(eventMap.values())
                    .sort((a, b) => new Date(a.time) - new Date(b.time))
                    .slice(0, 3);
                
                // Only update state if events actually changed (prevents flicker)
                const eventsJson = JSON.stringify(mergedEvents.map(e => ({ 
                    deviceName: e.deviceName, 
                    action: e.action, 
                    time: e.time 
                })));
                if (eventsJson !== lastEventsJsonRef.current) {
                    lastEventsJsonRef.current = eventsJson;
                    setNextEvents(mergedEvents);
                }
                
                // Update ad-hoc state
                setIsAdHoc(data.properties.isAdHocActive);
                
                if (announced) {
                    setLastAnnouncement(data.properties.currentMessage);
                    setIsTriggered(true);
                    
                    // Trigger the graph update
                    if (data.changeCallback) data.changeCallback();
                    
                    // Reset trigger after a brief pulse (100ms)
                    setTimeout(() => {
                        data.properties.triggerActive = false;
                        setIsTriggered(false);
                        if (data.changeCallback) data.changeCallback();
                    }, 100);
                }
                
                // Also check if ad-hoc triggered (not from checkAndAnnounce but from data() flow)
                if (data.properties.isAdHocActive && data.properties.triggerActive) {
                    setLastAnnouncement(data.properties.currentMessage);
                    setIsTriggered(true);
                    setIsAdHoc(true);
                    
                    if (data.changeCallback) data.changeCallback();
                    
                    setTimeout(() => {
                        data.properties.triggerActive = false;
                        setIsTriggered(false);
                        if (data.changeCallback) data.changeCallback();
                    }, 100);
                }
            };

            // Check immediately
            checkEvents();

            // Check every second
            intervalRef.current = setInterval(checkEvents, 1000);

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
            };
        }, []);

        // Update properties when controls change
        useEffect(() => {
            data.properties.leadTime = leadTime;
            data.properties.template = template;
        }, [leadTime, template]);

        const handleLeadTimeChange = (e) => {
            const value = parseInt(e.target.value) || 5;
            setLeadTime(Math.max(1, Math.min(60, value)));
        };

        const handleTemplateChange = (e) => {
            setTemplate(e.target.value);
        };

        const labelStyle = {
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '2px'
        };

        const selectStyle = {
            width: '100%',
            padding: '4px 6px',
            background: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '11px'
        };

        return React.createElement('div', {
            className: 'event-announcer-node',
            style: {
                padding: '8px',
                fontFamily: 'Arial, sans-serif',
                width: '280px',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '8px'
            }
        }, [
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                key: 'header',
                icon: '📢',
                title: 'Event Announcer',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: isTriggered ? '#4caf50' : '#555'
            }) : React.createElement('div', {
                key: 'header',
                style: { fontWeight: 'bold', marginBottom: '8px', color: '#ffb74d' }
            }, '📢 Event Announcer'),

            // Status badges
            React.createElement('div', {
                key: 'badges',
                style: { display: 'flex', gap: '8px', marginBottom: '8px' }
            }, [
                // Event count
                React.createElement('div', {
                    key: 'count',
                    style: {
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: upcomingCount > 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(100, 100, 100, 0.3)',
                        color: upcomingCount > 0 ? '#4caf50' : '#888',
                        borderRadius: '12px',
                        fontSize: '11px'
                    }
                }, `${upcomingCount} scheduled`),
                
                // Ad-hoc indicator (shows when message input is connected or used)
                isAdHoc && React.createElement('div', {
                    key: 'adhoc',
                    style: {
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: 'rgba(156, 39, 176, 0.3)',
                        color: '#ce93d8',
                        borderRadius: '12px',
                        fontSize: '11px'
                    }
                }, '⚡ Priority'),
                
                // Trigger indicator
                isTriggered && React.createElement('div', {
                    key: 'trig',
                    style: {
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: isAdHoc ? 'rgba(156, 39, 176, 0.3)' : 'rgba(255, 152, 0, 0.3)',
                        color: isAdHoc ? '#ce93d8' : '#ff9800',
                        borderRadius: '12px',
                        fontSize: '11px',
                        animation: 'pulse 0.5s ease-out'
                    }
                }, isAdHoc ? '⚡ Announcing!' : '🔔 Announcing!')
            ]),

            // Next events preview - always render container for stable height
            React.createElement('div', {
                key: 'next-events',
                style: {
                    marginBottom: '8px',
                    padding: '6px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    minHeight: '60px'
                }
            }, nextEvents.length > 0 ? [
                React.createElement('div', { 
                    key: 'title',
                    style: { color: '#888', marginBottom: '4px', fontSize: '9px' }
                }, 'Next events:'),
                ...nextEvents.map((event, i) => {
                    const time = new Date(event.time);
                    const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    const now = Date.now();
                    const msUntil = time.getTime() - now;
                    const minsUntil = Math.floor(msUntil / 60000);
                    const countdown = minsUntil < 1 ? '<1m' : minsUntil < 60 ? `${minsUntil}m` : `${Math.floor(minsUntil/60)}h ${minsUntil%60}m`;
                    
                    return React.createElement('div', {
                        key: i,
                        style: { 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            padding: '2px 0',
                            borderBottom: i < nextEvents.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                        }
                    }, [
                        React.createElement('span', { 
                            key: 'name',
                            style: { color: '#ccc' }
                        }, `${event.action === 'on' ? '🟢' : '🔴'} ${event.deviceName || 'Event'}`),
                        React.createElement('span', { 
                            key: 'time',
                            style: { color: '#888' }
                        }, `${timeStr} (${countdown})`)
                    ]);
                })
            ] : [
                React.createElement('div', { 
                    key: 'empty',
                    style: { color: '#666', fontStyle: 'italic', textAlign: 'center', paddingTop: '15px' }
                }, 'No scheduled events')
            ]),

            // Lead time control
            React.createElement('div', {
                key: 'lead-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('div', { key: 'label', style: labelStyle }, [
                    'Announce ',
                    React.createElement('strong', { key: 's' }, `${leadTime}`),
                    ' seconds before event ',
                    HelpIcon && React.createElement(HelpIcon, { key: 'h', text: tooltips.controls.leadTime, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'range',
                    value: leadTime,
                    onChange: handleLeadTimeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    min: 1,
                    max: 30,
                    style: {
                        width: '100%',
                        accentColor: '#4caf50'
                    }
                })
            ]),

            // Template selector
            React.createElement('div', {
                key: 'template-row',
                style: { marginBottom: '8px' }
            }, [
                React.createElement('div', { key: 'label', style: labelStyle }, [
                    'Announcement Style ',
                    HelpIcon && React.createElement(HelpIcon, { key: 'h', text: tooltips.controls.template, size: 10 })
                ]),
                React.createElement('select', {
                    key: 'select',
                    value: template,
                    onChange: handleTemplateChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: selectStyle
                }, [
                    React.createElement('option', { key: 'a', value: 'action' }, 'Action: "Turning on Kitchen Lights"'),
                    React.createElement('option', { key: 'p', value: 'passive' }, 'Passive: "Kitchen Lights is turning on"')
                ])
            ]),

            // Input socket for ad-hoc messages
            React.createElement('div', {
                key: 'inputs',
                style: { borderTop: '1px solid #333', paddingTop: '8px', marginBottom: '8px' }
            }, [
                React.createElement('div', {
                    key: 'message-in',
                    style: { display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '8px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 's',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.message.socket, nodeId: data.id, side: "input", key: "message" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { 
                        key: 'l', 
                        style: { fontSize: '11px', color: '#ce93d8' } 
                    }, '⚡ Priority Message'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'h', text: tooltips.inputs.message, size: 10 })
                ])
            ]),

            // Last announcement preview
            React.createElement('div', {
                key: 'preview',
                style: {
                    padding: '6px',
                    background: lastAnnouncement ? (isAdHoc ? 'rgba(156, 39, 176, 0.15)' : 'rgba(76, 175, 80, 0.15)') : 'rgba(0,0,0,0.3)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: lastAnnouncement ? (isAdHoc ? '#ce93d8' : '#4caf50') : '#666',
                    marginBottom: '8px',
                    fontStyle: lastAnnouncement ? 'normal' : 'italic',
                    borderLeft: lastAnnouncement ? `3px solid ${isAdHoc ? '#ce93d8' : '#4caf50'}` : 'none',
                    paddingLeft: lastAnnouncement ? '8px' : '6px'
                }
            }, [
                React.createElement('div', { key: 'l', style: { fontSize: '9px', color: '#888', marginBottom: '2px' } }, 
                    lastAnnouncement ? (isAdHoc ? 'Priority message:' : 'Last announcement:') : 'Waiting for events...'),
                lastAnnouncement || 'No announcements yet'
            ]),

            // Outputs
            React.createElement('div', {
                key: 'outputs',
                style: { borderTop: '1px solid #333', paddingTop: '8px' }
            }, [
                React.createElement('div', {
                    key: 'trigger-out',
                    style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement('span', { 
                        key: 'l', 
                        style: { fontSize: '11px', color: isTriggered ? '#4caf50' : '#aaa' } 
                    }, 'Trigger'),
                    React.createElement(RefComponent, {
                        key: 's',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.trigger.socket, nodeId: data.id, side: "output", key: "trigger" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),
                React.createElement('div', {
                    key: 'message-out',
                    style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement('span', { key: 'l', style: { fontSize: '11px', color: '#ffb74d' } }, 'Message'),
                    React.createElement(RefComponent, {
                        key: 's',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.messageOut.socket, nodeId: data.id, side: "output", key: "messageOut" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),
                React.createElement('div', {
                    key: 'event-out',
                    style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }
                }, [
                    React.createElement('span', { key: 'l', style: { fontSize: '11px', color: '#aaa' } }, 'Event'),
                    React.createElement(RefComponent, {
                        key: 's',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.event.socket, nodeId: data.id, side: "output", key: "event" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ])
            ])
        ]);
    }

    window.nodeRegistry.register('UpcomingEventsNode', {
        label: 'Event Announcer',
        category: 'Timer/Event',
        nodeClass: UpcomingEventsNode,
        factory: (cb) => new UpcomingEventsNode(cb),
        component: UpcomingEventsComponent
    });

    // console.log('[UpcomingEventsNode] Event Announcer mode registered');
})();
