'use strict';

const chalk = require('chalk');
const EXPIRATION_WRITE_STEP = 100;
const EXPIRATION_LOOK_BACK = 300 * 1000;

const performExpiration = function(assignments) {
    const expirationLimit = Date.now() - EXPIRATION_LOOK_BACK;
    Object.keys(assignments).forEach((requestId) => {
        if (assignments[requestId].timestamp < expirationLimit) {
            delete assignments[requestId];
        }
    });
};

module.exports = function() {
    const colors = ["bgBlack", "bgBlue", "bgCyan", "bgGreen", "bgMagenta", "bgRed", "bgWhite", "bgYellow", "blue",
        "cyan", "gray", "green", "grey", "magenta", "red", "yellow"];
    let nextColorIndex = 0;
    let writeCount = 0;
    const assignments = {};
    return function(requestId, message) {
        if (!assignments[requestId]) {
            assignments[requestId] = {
                color: colors[nextColorIndex],
                timestamp: Date.now()
            };
            nextColorIndex = (nextColorIndex + 1) % colors.length;
            if (writeCount++ == EXPIRATION_WRITE_STEP) {
                performExpiration(assignments);
                writeCount = 0;
            }
        }
        return chalk[assignments[requestId].color](message);
    };
};