'use strict';

module.exports = function(parsedLogLine) {
    const formatters = {
        start: function(line) {
            return 'Request started';
        },
        end: function(line) {
            return 'Request finished'
        },
        report: function(line) {
            return `Request reported. Duration: ${line.durationMs}ms, ` +
                `Billed Duration: ${line.billedDurationMs}ms, ` +
                `Memory Size: ${line.memorySize}MB, ` +
                `Max Memory Used: ${line.maxMemoryUsed}MB`;
        },
        simple: function(line) {
            return line.message.trim();
        }
    };

    const formatter = formatters[parsedLogLine.type];
    if (!formatter) {
        throw new Error('Log line type ' + parsedLogLine.type  + ' not supported');
    }
    return formatter(parsedLogLine);
};