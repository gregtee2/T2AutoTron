// js/event-scheduler.js
function createEventScheduler() {
    const scheduler = {
        events: new Map(),
        registerEvent(nodeId, eventData) {
            if (!eventData || !eventData.time || !eventData.description) {
                this.events.delete(nodeId);
                return;
            }
            this.events.set(nodeId, {
                time: eventData.time,
                description: eventData.description,
                nodeId: nodeId
            });
        },
        unregisterEvent(nodeId) {
            this.events.delete(nodeId);
        },
        getScheduledEvents() {
            const eventsArray = Array.from(this.events.values());
            return eventsArray
                .filter(event => event.time > Date.now())
                .sort((a, b) => a.time - b.time);
        },
        clear() {
            this.events.clear();
        }
    };

    return scheduler;
}

const scheduler = createEventScheduler();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scheduler };
} else {
    window.EventScheduler = scheduler;
    console.log("EventScheduler initialized:", window.EventScheduler);
}