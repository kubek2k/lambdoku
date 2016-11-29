#!/usr/bin/env node

'use strict';

const commander = require('commander');
const fs = require('fs');
const exec = require('child-process-promise').exec;
const http = require('https');
const chalk = require('chalk');
const Lambda = require('aws-sdk-promise').Lambda;

const handle = function(fn) {
    return function() {
        return Promise.all(fn.apply(undefined, arguments))
            .catch(err => {
                console.log(chalk.red(err), err.stack);
            });
    }
};

const getLambdaNames = function(commander) {
    if (commander.lambda) {
        return commander.lambda;
    }
    try {
        return fs.readFileSync('.lambdoku', {encoding: 'utf8'}).trim().split(',');
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
        getFunctionVersions: function() {
            return withMessage(`Getting versions of ${chalk.blue(lambdaArn)}`,
                () =>
                    lambda.listVersionsByFunction({
                        FunctionName: lambdaArn
                    }).promise()
                        .then(res => res.data.Versions)
                , verbose);
        },
        getFunctionLatestPublishedVersion: function() {
            return client.getFunctionVersions(lambdaArn)
                .then(versions => {
                    return versions
                        .map(v => v.Version)
                        .filter(v => v !== '$LATEST')
                        .reverse()[0];
                });
        },
        name() {
            return lambdaArn;
        }
    };
    return client;
};

const createCommandLineLambdas = function(commander) {
    return getLambdaNames(commander)
        .map(lambdaName => AWSLambdaClient(lambdaName, commander.verbose));
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
    .command('init <lambdaName> [otherLambdas...]')
    .description('init directory for use with lambda(s)')
    .action(handle((lambdaName, otherLambdas) => {
        const lambdasString = (otherLambdas || []).concat(lambdaName).join(',');
        fs.writeFileSync(".lambdoku", lambdasString, {encoding: 'utf8'});
        return [];
    }));

commander
    .command('config')
    .description('get env configuration for lambda')
    .action(handle(() => {
        return createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionEnvVariables('$LATEST')
                    .then(config => {
                        console.log(`Env variables of ${chalk.blue(lambda.name())}`)
                        for (const k in config) {
                            console.log(`${k}='${config[k]}'`);
                        }
                        console.log('');
                    }));
    }));

commander
    .command('config:unset <envName> [envName1...]')
    .description('unset env configuration value on lambda')
    .action(handle((envName, otherEnvNames) => {
        return createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionEnvVariables('$LATEST')
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
                    .then(() => lambda.publishFunction(`Unsetting env variables ${envName}`)));
    }));

commander
    .command('config:set <envName=envValue> [envName1=envValue1...]')
    .description('set env configuration value of lambda')
    .action(handle((assignment1, otherAssignments) => {
        const assignments = otherAssignments.concat(assignment1)
            .reduce((acc, assignment) => {
                const splitted = assignment.split('=');
                if (splitted.length != 2) {
                    throw new Error(`Assignment ${assignment} in wrong form. Should be envName='envValue'.`);
                }
                acc[splitted[0]] = splitted[1];
                return acc;
            }, {});
        return createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionEnvVariables('$LATEST')
                    .then(envs => Object.assign({}, envs, assignments))
                    .then(newEnv => lambda.setFunctionConfiguration(newEnv))
                    .then(() => lambda.publishFunction(`Set env variables ${Object.keys(assignments)}`)));
    }));

commander
    .command('config:get <envName> [envName1...]')
    .description('get env configuration value of lambda')
    .action(handle((envName1, otherEnvNames) => {
        return createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionEnvVariables('$LATEST')
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
                        console.log(`Env variables for ${lambda.name()}`)
                        for (const k in envs) {
                            console.log(`${k}=\'${envs[k]}\'`)
                        }
                        console.log('');
                    }));
    }));

commander
    .command('pipeline')
    .alias('pipelines')
    .description('show downstream lambdas of given lambda')
    .action(handle(() => {
        return createCommandLineLambdas(commander)
            .map(lambda => lambda
                .getFunctionEnvVariables('$LATEST')
                .then(config => {
                    extractDownstreamFunctions(config)
                        .forEach(lambdaName => {
                            console.log(`Downstream lambdas for ${chalk.blue(lambdaName)}`)
                            console.log(lambdaName);
                        });
                }));
    }));

commander
    .command('pipeline:add <downstreamLambdaName>')
    .alias('pipelines:add')
    .description('add downstream to given lambda')
    .action(handle(downstreamLambdaName =>
        createCommandLineLambdas(commander)
            .map(lambda => lambda
                .getFunctionEnvVariables('$LATEST')
                .then(config => {
                    const downstreamLambdas = extractDownstreamFunctions(config);
                    downstreamLambdas.push(downstreamLambdaName);
                    config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
                    return config;
                })
                .then(config => lambda.setFunctionConfiguration(config))
                .then(() => lambda.publishFunction(`Added downstream ${downstreamLambdaName}`)))));

commander
    .command('pipeline:remove <downstreamLambdaName>')
    .alias('pipelines:remove')
    .description('remove downstream from given lambda')
    .action(handle(downstreamLambdaName =>
        createCommandLineLambdas(commander)
            .map(lambda => lambda
                .getFunctionEnvVariables('$LATEST')
                .then(config => {
                    const downstreamLambdas = extractDownstreamFunctions(config);
                    downstreamLambdas.splice(downstreamLambdas.indexOf(downstreamLambdaName), 1);
                    config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
                    return config;
                })
                .then(config => lambda.setFunctionConfiguration(config))
                .then(() => lambda.publishFunction(`Removed downstream ${downstreamLambdaName}`)))));

commander
    .command('pipeline:promote')
    .alias('pipelines:promote')
    .description('promote lambda to all its downstreams')
    .action(handle(() => {
        return createCommandLineLambdas(commander)
            .map(upstreamLambda => upstreamLambda
                .getFunctionLatestPublishedVersion()
                .then(version => {
                    return upstreamLambda.getFunctionCodeLocation(version)
                        .then(functionCodeLocation => downloadFunctionCode(functionCodeLocation))
                        .then(codeFileName => {
                            return upstreamLambda.getFunctionEnvVariables(version)
                                .then(extractDownstreamFunctions)
                                .then(downstreamLambdas => {
                                    return Promise.all(
                                        downstreamLambdas
                                            .map(downstreamLambda => AWSLambdaClient(downstreamLambda, commander.verbose))
                                            .map(lambda => lambda.updateFunctionCode(codeFileName)
                                                .then(() => lambda.publishFunction(`Promoting code from ${lambda.name()} version ${version}`))));
                                });
                        });
                }));
    }));

commander
    .command('releases')
    .description('lists releases of lambda')
    .action(handle(() => {
        return createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionVersions()
                    .then(versions => {
                        console.log(`Releases of ${chalk.blue(lambda.name())}`);
                        versions.reverse()
                            .filter(version => {
                                return version.Version !== '$LATEST';
                            })
                            .forEach(version => {
                                console.log(`${chalk.green(version.Version)} | ` +
                                    `${version.Description} | ` +
                                    `${chalk.red(version.LastModified)}`);

                            });
                        console.log('');
                    }));
    }));

commander
    .command('rollback <version>')
    .alias('releases:rollback')
    .description('rolls back to given version of lambda')
    .action(handle((version) =>
        createCommandLineLambdas(commander)
            .map(lambda =>
                lambda.getFunctionCodeLocation(version)
                    .then(codeLocation => downloadFunctionCode(codeLocation))
                    .then(codeFileName => lambda.updateFunctionCode(codeFileName))
                    .then(() => lambda.getFunctionEnvVariables(version))
                    .then(config => lambda.setFunctionConfiguration(config))
                    .then(() => lambda.publishFunction(`Rolling back to version ${version}`)))));

commander
    .command('*')
    .action(() => {
        commander.help();
    });

commander.parse(process.argv);
