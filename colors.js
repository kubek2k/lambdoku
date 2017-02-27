'use strict';

const chalk = require('chalk');

module.exports = function() {
    const colors = Object.keys(chalk.styles)
        .filter(color => color !== 'reset');
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