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
    return () => {
        const logGroupName = `/aws/lambda/${lambdaName}`;
        return logs
            .filterLogEvents({
                logGroupName: logGroupName,
                limit: numberOfEntries
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
    };
};