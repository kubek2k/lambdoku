'use strict';

const Logs = require('aws-sdk-promise').CloudWatchLogs;

module.exports = (lambdaArnOrName, numberOfEntries) => {
    const parseArn = (arnOrName) => {
        const parts = arnOrName.split(':');
        if (parts.length > 1) {
            return {
                region: parts[3],
                name: parts[6]
            };
        } else {
            return {
                region: process.env.AWS_DEFAULT_REGION,
                name: arnOrName
            };
        }
    };
    const arn = parseArn(lambdaArnOrName);
    const logs = new Logs({region: arn.region});
    const lambdaName = arn.name;
    return {
        since: (startTime) => {
            const logGroupName = `/aws/lambda/${lambdaName}`;
            return logs
                .filterLogEvents({
                    limit: numberOfEntries,
                    interleaved: true,
                    logGroupName,
                    startTime
                })
                .promise()
                .then(({data}) => {
                    return data;
                })
                .catch(err => {
                    if (err.statusCode === 400)
                        throw new Error(`No logs for lambda ${lambdaName}`, err);
                    throw err;
                });
        },
        next: nextToken => {
            const logGroupName = `/aws/lambda/${lambdaName}`;
            return logs
                .filterLogEvents({
                    logGroupName,
                    nextToken
                })
                .promise()
                .then(({data}) => data)
                .catch(err => {
                    if (err.statusCode === 400)
                        throw new Error(`No logs for lambda ${lambdaName}`, err);
                    throw err;
                });
        }
    };
};
