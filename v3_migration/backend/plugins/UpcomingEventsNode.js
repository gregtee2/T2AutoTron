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
        node: "Announces each scheduled event X seconds before it fires. Connect 'Trigger' to TTS Enable and 'Message' to TTS Message.",
        outputs: {
            trigger: "Boolean pulse - true when announcing, then false",
            message: "The announcement text (e.g., 'Turning Kitchen Counter Lights on')",
            event: "The event object that's about to fire"
        },
        controls: {
            leadTime: "How many seconds before the event to make the announcement",
            template: "Customize the announcement wording"
        }
    };

    class UpcomingEventsNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Event Announcer");
            this.changeCallback = changeCallback;
            this.width = 300;
            this.height = 280;

            this.properties = {
                leadTime: 5,           // Seconds before event to announce
                template: 'action',    // 'action' = "Turning X on", 'passive' = "X is turning on"
                announcedEvents: {},   // Track which events we've announced (by unique key)
                currentMessage: '',    // Current announcement message
                currentEvent: null,    // Current event being announced
                triggerActive: false,  // Whether trigger is currently firing
                upcomingCount: 0       // Number of upcoming events
            };

            // Outputs
            this.addOutput('trigger', new ClassicPreset.Output(sockets.boolean, 'Trigger'));
            this.addOutput('message', new ClassicPreset.Output(sockets.any, 'Message'));
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
            
            // Find events that are within our lead time window
            for (const event of events) {
                if (!event.time) continue;
                
                const eventTime = new Date(event.time).getTime();
                const timeUntil = eventTime - now;
                
                // Is this event within our announcement window? (leadTime seconds before, up until it fires)
                if (timeUntil > 0 && timeUntil <= leadMs) {
                    const key = this.getEventKey(event);
                    
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
            if (this.properties.triggerActive) {
                this.properties.triggerActive = false;
            }
            
            return null;
        }

        data(inputs) {
            return {
                trigger: this.properties.triggerActive,
                message: this.properties.currentMessage,
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
        const intervalRef = useRef(null);
        const backendPollRef = useRef(null);
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Request backend events via socket
        useEffect(() => {
            const socket = window.socket;
            if (!socket) return;

            // Handler for backend events
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

        // Main check loop - runs every second
        useEffect(() => {
            const checkEvents = () => {
                const announced = data.checkAndAnnounce();
                
                // Update local state
                setUpcomingCount(data.properties.upcomingCount);
                
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
                minWidth: '280px'
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
                }, `${upcomingCount} upcoming`),
                
                // Trigger indicator
                isTriggered && React.createElement('div', {
                    key: 'trig',
                    style: {
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: 'rgba(255, 152, 0, 0.3)',
                        color: '#ff9800',
                        borderRadius: '12px',
                        fontSize: '11px',
                        animation: 'pulse 0.5s ease-out'
                    }
                }, '🔔 Announcing!')
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

            // Last announcement preview
            React.createElement('div', {
                key: 'preview',
                style: {
                    padding: '6px',
                    background: lastAnnouncement ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0,0,0,0.3)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: lastAnnouncement ? '#4caf50' : '#666',
                    marginBottom: '8px',
                    fontStyle: lastAnnouncement ? 'normal' : 'italic',
                    borderLeft: lastAnnouncement ? '3px solid #4caf50' : 'none',
                    paddingLeft: lastAnnouncement ? '8px' : '6px'
                }
            }, [
                React.createElement('div', { key: 'l', style: { fontSize: '9px', color: '#888', marginBottom: '2px' } }, 
                    lastAnnouncement ? 'Last announcement:' : 'Waiting for events...'),
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
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.message.socket, nodeId: data.id, side: "output", key: "message" } }),
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
