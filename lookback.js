'use strict';


module.exports = function(size) {
    const seenEvents = {};
    const seenEventsQueue = [];
    return {
        add: (eventId) => {
            if (seenEventsQueue.length > size) {
                const poppedEventId = seenEventsQueue.pop();
                const numberSeen = seenEvents[poppedEventId]--;
                if (numberSeen === 0) {
                    delete seenEvents[poppedEventId];
                }
            }
            seenEventsQueue.unshift(eventId);
            if (seenEvents[eventId]) {
                seenEvents[eventId]++;
            } else {
                seenEvents[eventId] = 1;
            }
        },
        seen: (eventId) => {
            return seenEvents[eventId];
        }
    };
};