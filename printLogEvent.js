'use strict';

const parseLogLine = require('./parseLambdaLogLine');
const formatLogLine = require('./formatLogLine');
const chalk = require('chalk');

module.exports = function({timestamp, message}) {
    const logLine = parseLogLine(message);
    const formattedLogLine = formatLogLine(logLine);
    const date = new Date(timestamp);
    console.log(`${chalk.cyan(date.toISOString())} ${chalk.cyan(logLine.requestId)}: ${chalk.white(formattedLogLine)}`);
};