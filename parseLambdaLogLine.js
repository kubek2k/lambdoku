'use strict';

module.exports = function(logLine) {
    if (logLine.startsWith('START')) {
        const split = logLine.trim().split(' ');
        const requestId = split[2];
        const version = split[4];
        return {
            type: 'start',
            requestId,
            version
        }
    } else if (logLine.startsWith('END')) {
        const split = logLine.trim().split(' ');
        const requestId = split[2];
        return {
            type: 'end',
            requestId
        }
    } else if (logLine.startsWith('REPORT')) {
        const split = logLine.trim().split('\t');
        const requestId = split[0].split(' ')[2];
        return {
            type: 'report',
            requestId
        }
    } else {
        const split = logLine.trim().split('\t');
        const requestId = split[1];
        const message = split[2];
        return {
            type: 'simple',
            requestId,
            message
        }
    }
};