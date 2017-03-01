'use strict';

const chalk = require('chalk');

module.exports = function() {
    const colors = ["bgBlack", "bgBlue", "bgCyan", "bgGreen", "bgMagenta", "bgRed", "bgWhite", "bgYellow", "blue",
        "cyan", "gray", "green", "grey", "magenta", "red", "yellow"];
    let nextColorIndex = 0;
    const assignment = {};
    return function(requestId, message) {
        if (!assignment[requestId]) {
            assignment[requestId] = colors[nextColorIndex];
            nextColorIndex = (nextColorIndex + 1) % colors.length;
        }
        return chalk[assignment[requestId]](message);
    };
};