'use strict';

const parseLogLine = require('./parseLambdaLogLine');
const formatLogLine = require('./formatLogLine');
const colorMessage = require('./colors')();

module.exports = function({timestamp, message}) {
    const logLine = parseLogLine(message);
    const formattedLogLine = formatLogLine(logLine);
    const date = new Date(timestamp);
    console.log(`${colorMessage(logLine.requestId, date.toISOString() + ' ' + logLine.requestId)}: ${formattedLogLine}`);
};