#!/usr/bin/env node

'use strict';

const commander = require('commander');
const fs = require('fs');
const exec = require('child-process-promise').exec;
const http = require('https');
const chalk = require('chalk');
const Lambda = require('aws-sdk-promise').Lambda;
const AWSLogs = require('./logs/logs');
const lookback = require('./logs/lookback');
const printLogEvent = require('./logs/printLogEvent');

const handle = function(fn) {
    return function() {
        return fn.apply(undefined, arguments)
            .catch(err => {
                console.log(chalk.red(err), err.stack);
            });
    }
};

const getLambdaName = function(commander) {
    if (commander.lambda) {
        return commander.lambda;
    }
    try {
        return fs.readFileSync('.lambdoku', {encoding: 'utf8'}).trim();
    } catch (err) {
        throw new Error('No lambda name param passed and reading .lambdoku file failed. Did you run \'lambdoku init\'?');
    }
};

const extractDownstreamFunctions = function(config) {
    const configStringVal = config['DOWNSTREAM_LAMBDAS'] || '';
    return configStringVal.length > 0 ? configStringVal.split(';') : [];
};

const downloadFunctionCode = function(codeLocation) {
    return withMessage('Getting code of lambda',
        () => new Promise((resolve, reject) => {
            const tempDir = fs.mkdtempSync('/tmp/lambdoku-');
            const tempFileLocation = tempDir + 'lambdoku-temp.zip';
            const tempLambdaZipStream = fs.createWriteStream(tempFileLocation);
            http.get(codeLocation, function(response) {
                response.pipe(tempLambdaZipStream);
                response.on('end', function() {
                    tempLambdaZipStream.end();
                    resolve(tempFileLocation);
                });
                response.on('error', (err) => reject(err));
            });
        }));
};

const withMessage = function(message, fn, verbose) {
    if (verbose) {
        process.stdout.write(message);
    }
    return fn()
        .then(result => {
            if (verbose) {
                process.stdout.write(`. ${chalk.green('\u2713')}\n`);
            }
            return result;
        });
};

const AWSLambdaClient = function(lambdaArn, verbose) {
    const lambda = new Lambda({region: process.env.AWS_DEFAULT_REGION});
    const client = {
        getFunctionEnvVariables: function(version) {
            return withMessage(`Getting function configuration of ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.getFunctionConfiguration({
                        FunctionName: lambdaArn,
                        Qualifier: version
                    }).promise()
                        .then(res => res.data.Environment ? res.data.Environment.Variables : {}),
                verbose);
        },
        setFunctionConfiguration: function(config) {
            return withMessage(`Changing environment variables of ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.updateFunctionConfiguration({
                        FunctionName: lambdaArn,
                        Environment: {
                            Variables: config
                        }
                    }).promise()
                , verbose);
        },
        getFunctionCodeLocation: function(version) {
            return withMessage(`Getting code location for ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.getFunction({
                        FunctionName: lambdaArn,
                        Qualifier: version
                    }).promise()
                        .then(res => res.data.Code.Location)
                , verbose);
        },
        publishFunction: function(description) {
            return withMessage(`Publishing new version of function ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.publishVersion({
                        FunctionName: lambdaArn,
                        Description: description
                    }).promise()
                , verbose);
        },
        updateFunctionCode: function(codeFileName) {
            return withMessage(`Updating function code for ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.updateFunctionCode({
                        FunctionName: lambdaArn,
                        ZipFile: fs.readFileSync(codeFileName)
                    }).promise()
                , verbose);
        },
        getFunctionVersions: function(nextMarker) {
            return withMessage(`Getting versions of ${chalk.blue(lambdaArn)}`,
                    () => lambda.listVersionsByFunction({
                        FunctionName: lambdaArn,
                        Marker: nextMarker
                    })
                    .promise()
                    .then(res => ({
                        versions: res.data.Versions,
                        nextMarker: res.data.NextMarker
                    })), verbose);
        },
        getFunctionLatestPublishedVersion: function() {
            const goToTheLastVersionList = function(nextMarker) {
                return client.getFunctionVersions(nextMarker)
                    .then(result => {
                        if (result.nextMarker) {
                            return goToTheLastVersionList(result.nextMarker);
                        }
                        return result.versions;
                    })
            };
            return goToTheLastVersionList()
                .then(versions => versions
                        .map(v => v.Version)
                        .reverse()[0]);
        }
    };
    return client;
};

const createCommandLineLambda = function(commander) {
    return AWSLambdaClient(getLambdaName(commander), commander.verbose);
};

const createCommandLineLogs = function(commander, command) {
    return AWSLogs(getLambdaName(commander), command.number);
};

commander
    .version('1.0')
    .option('-a, --lambda <lambdaName>', 'lambda to run operation on')
    .option('-v --verbose', 'turn on verbose output');

commander
    .command('help')
    .description('shows help')
    .action(() => {
        commander.help();
    });

commander
    .command('init <lambdaName>')
    .description('init directory for use with lambda')
    .action(lambdaName => {
        fs.writeFileSync(".lambdoku", lambdaName.trim(), {encoding: 'utf8'});
    });

commander
    .command('config')
    .description('get env configuration for lambda')
    .action(handle(() => {
        return createCommandLineLambda(commander).getFunctionEnvVariables('$LATEST')
            .then(config => {
                for (const k in config) {
                    console.log(`${k}='${config[k]}'`);
                }
            })
    }));

commander
    .command('config:unset <envName> [envName1...]')
    .description('unset env configuration value on lambda')
    .action(handle((envName, otherEnvNames) => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(envs => {
                const envVarsToUnset = otherEnvNames.concat(envName);
                envVarsToUnset.forEach(envName => {
                    if (!envs.hasOwnProperty(envName)) {
                        throw new Error(`No env variable ${envName} set on lambda ${lambdaName}`);
                    }
                    delete envs[envName];
                });
                return envs;
            })
            .then(envs => lambda.setFunctionConfiguration(envs))
            .then(() => lambda.publishFunction(`Unsetting env variables ${envName}`));
    }));

commander
    .command('config:set <envName=envValue> [envName1=envValue1...]')
    .description('set env configuration value of lambda')
    .action(handle((assignment1, otherAssignments) => {
        const lambda = createCommandLineLambda(commander);
        const assignments = otherAssignments.concat(assignment1)
            .reduce((acc, assignment) => {
                const splitted = assignment.split('=');
                if (splitted.length != 2) {
                    throw new Error(`Assignment ${assignment} in wrong form. Should be envName='envValue'.`);
                }
                acc[splitted[0]] = splitted[1];
                return acc;
            }, {});
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(envs => Object.assign({}, envs, assignments))
            .then(newEnv => lambda.setFunctionConfiguration(newEnv))
            .then(() => lambda.publishFunction(`Set env variables ${Object.keys(assignments)}`));
    }));

commander
    .command('config:get <envName> [envName1...]')
    .description('get env configuration value of lambda')
    .action(handle((envName1, otherEnvNames) => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(envVariables => {
                const envs = otherEnvNames.concat(envName1)
                    .reduce((acc, envName) => {
                        const envValue = envVariables[envName];
                        if (envValue) {
                            acc[envName] = envValue;
                        } else {
                            throw new Error(`No such env variable set ${envName}`);
                        }
                        return acc;
                    }, {});
                for (const k in envs) {
                    console.log(`${k}=\'${envs[k]}\'`)
                }
            });
    }));

commander
    .command('pipeline')
    .alias('pipelines')
    .description('show downstream lambdas of given lambda')
    .action(handle(() => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(config => {
                extractDownstreamFunctions(config)
                    .forEach(lambdaName => {
                        console.log(lambdaName);
                    });
            });
    }));

commander
    .command('pipeline:add <downstreamLambdaName>')
    .alias('pipelines:add')
    .description('add downstream to given lambda')
    .action(handle(downstreamLambdaName => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(config => {
                const downstreamLambdas = extractDownstreamFunctions(config);
                downstreamLambdas.push(downstreamLambdaName);
                config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
                return config;
            })
            .then(config => lambda.setFunctionConfiguration(config))
            .then(() => lambda.publishFunction(`Added downstream ${downstreamLambdaName}`));
    }));

commander
    .command('pipeline:remove <downstreamLambdaName>')
    .alias('pipelines:remove')
    .description('remove downstream from given lambda')
    .action(handle(downstreamLambdaName => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionEnvVariables('$LATEST')
            .then(config => {
                const downstreamLambdas = extractDownstreamFunctions(config);
                downstreamLambdas.splice(downstreamLambdas.indexOf(downstreamLambdaName), 1);
                config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
                return config;
            })
            .then(config => lambda.setFunctionConfiguration(config))
            .then(() => lambda.publishFunction(`Removed downstream ${downstreamLambdaName}`));
    }));

commander
    .command('pipeline:promote')
    .alias('pipelines:promote')
    .description('promote lambda to all its downstreams')
    .action(handle(() => {
        const lambdaName = getLambdaName(commander);
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionLatestPublishedVersion()
            .then(version => {
                return lambda.getFunctionCodeLocation(version)
                    .then(functionCodeLocation => downloadFunctionCode(functionCodeLocation))
                    .then(codeFileName => {
                        return lambda.getFunctionEnvVariables(version)
                            .then(extractDownstreamFunctions)
                            .then(downstreamLambdas => {
                                return Promise.all(
                                    downstreamLambdas
                                        .map(downstreamLambda => AWSLambdaClient(downstreamLambda, commander.verbose))
                                        .map(lambda => lambda.updateFunctionCode(codeFileName)
                                            .then(() => lambda.publishFunction(`Promoting code from ${lambdaName} version ${version}`))));
                            });
                    });
            });
    }));

commander
    .command('releases')
    .description('lists releases of lambda')
    .action(handle(() => {
        return createCommandLineLambda(commander).getFunctionVersions()
            .then(({versions}) => {
                versions.reverse()
                    .filter(version => {
                        return version.Version !== '$LATEST';
                    })
                    .forEach(version => {
                        console.log(`${chalk.green(version.Version)} | ` +
                            `${version.Description} | ` +
                            `${chalk.red(version.LastModified)}`);
                    });
            });
    }));

commander
    .command('rollback <version>')
    .alias('releases:rollback')
    .description('rolls back to given version of lambda')
    .action(handle((version) => {
        const lambda = createCommandLineLambda(commander);
        return lambda.getFunctionCodeLocation(version)
            .then(codeLocation => downloadFunctionCode(codeLocation))
            .then(codeFileName => lambda.updateFunctionCode(codeFileName))
            .then(() => lambda.getFunctionEnvVariables(version))
            .then(config => lambda.setFunctionConfiguration(config))
            .then(() => lambda.publishFunction(`Rolling back to version ${version}`));
    }));

commander
    .command('logs')
    .option('-n,--number <number>', 'number of entries', Number, 100)
    .option('-t, --tail', 'tail logs', false)
    .description('gets the latest logs for lambda')
    .action(handle((command) => {
        const retrieveLogs = createCommandLineLogs(commander, command);
        const printLogEvents = (events) => {
            return events.forEach(printLogEvent);
        };
        const lookbackBuffer = lookback(100000);
        const timeoutPromise = () => new Promise(resolve => setTimeout(resolve, 1000));
        const retrieveSince = Date.now() - 20 * 1000;
        if (!command.tail) {
            return retrieveLogs
                .since(retrieveSince)
                .then(({events}) => printLogEvents(events));
        } else {
            const handleLogs = (data) => {
                const {events, nextToken} = data;
                const notSeenEvents = events.filter(({eventId}) => {
                    return !lookbackBuffer.seen(eventId)
                });
                printLogEvents(notSeenEvents);
                events
                    .forEach(({eventId}) => {
                        lookbackBuffer.add(eventId);
                    });
                return nextToken;
            };
            const completelyConsume = (nextToken) => {
                if (nextToken) {
                    return retrieveLogs
                        .next(nextToken)
                        .then(handleLogs)
                        .then((newNextToken => completelyConsume(newNextToken)));
                }
            };
            const continuouslyConsume = (since) => {
                return retrieveLogs
                    .since(since)
                    .then(handleLogs)
                    .then(completelyConsume)
                    .then(timeoutPromise)
                    .then(() => continuouslyConsume(Date.now() - (20 * 1000)))

            };
            return continuouslyConsume(retrieveSince);
        }
    }));

commander
    .command('push <fileName>')
    .description('pushes given zip/jar file to be used by lambda')
    .action(handle((fileName) => {
        const commandLineLambda = createCommandLineLambda(commander);
        return commandLineLambda.updateFunctionCode(fileName)
            .then(commandLineLambda.publishFunction('New function code version'));
    }));

commander
    .command('*')
    .action(() => {
        commander.help();
    });

commander.parse(process.argv);
