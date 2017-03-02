'use strict';

const chalk = require('chalk');
const EXPIRATION_WRITE_STEP = 100;
const EXPIRATION_LOOK_BACK = 300 * 1000;
const COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'];
const BG_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const generateColorPairs = function() {
    return COLORS
        .map((color) => {
            return BG_COLORS
                .filter(bgColor => bgColor !== color)
                .map(bgColor => 'bg' + bgColor.charAt(0).toUpperCase() + bgColor.substring(1))
                .map(bgColor => ({color, bgColor}));
        })
        .reduce((acc, val) => {
            val.forEach((v) => {
                acc.push(v);
            });
            return acc;
        }, []);
};
const COLOR_PAIRS = generateColorPairs(COLORS);

const performExpiration = function(assignments) {
    const expirationLimit = Date.now() - EXPIRATION_LOOK_BACK;
    Object.keys(assignments).forEach((requestId) => {
        if (assignments[requestId].timestamp < expirationLimit) {
            delete assignments[requestId];
        }
    });
};

module.exports = function() {
    let nextColorPairIndex = 0;
    let writeCount = 0;
    const assignments = {};
    return function(requestId, message) {
        if (!assignments[requestId]) {
            assignments[requestId] = {
                colorPair: COLOR_PAIRS[nextColorPairIndex],
                timestamp: Date.now()
            };
            nextColorPairIndex = (nextColorPairIndex + 1) % COLOR_PAIRS.length;
            if (writeCount++ == EXPIRATION_WRITE_STEP) {
                performExpiration(assignments);
                writeCount = 0;
            }
        }
        const colorPair = assignments[requestId].colorPair;
        return chalk[colorPair.color][colorPair.bgColor](message);
    };
};