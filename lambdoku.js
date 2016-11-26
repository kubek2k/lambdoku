#!/usr/bin/env node

const commander = require('commander');
const fs = require('fs');
const child_process = require('child_process');
const http = require('https');

const errorHandler = function(err) {
    console.log(err, err.stack);
    process.exit(1);
};

const getLambdaName = function(commander) {
    if (commander.lambda) {
        return commander.lambda;
    }
    try {
        return fs.readFileSync('.lambdoku', {encoding: 'utf8'});
    } catch (err) {
        throw new Error('No lambda name param passed and reading .lambdoku file failed. Did you run \'lambdoku init\'?');
    }
};

const getFunctionEnvVariables = function(lambdaName, version) {
    const command = `aws lambda get-function-configuration --function-name ${lambdaName} --qualifier \'${version}\'`;
    return JSON.parse(child_process.execSync(command, {encoding: 'utf8'})).Environment.Variables;
};

const setFunctionConfiguration = function(lambdaName, config) {
    const jsonConfig = JSON.stringify({
        Variables: config
    });
    const command = `aws lambda update-function-configuration --function-name ${lambdaName} --environment \'${jsonConfig}\'`;
    child_process.execSync(command, {encoding: 'utf8'});
};

const getFunctionCodeLocation = function(lambdaName, version) {
    const command = `aws lambda get-function --function-name ${lambdaName} --qualifier \'${version}\'`;
    return JSON.parse(child_process.execSync(command, {encoding: 'utf8'})).Code.Location;
};

const extractDownstreamLambdas = function(config) {
    const configStringVal = config['DOWNSTREAM_LAMBDAS'] || '';
    return configStringVal.length > 0 ? configStringVal.split(';') : [];
};

const publishFunction = function(lambdaName, description) {
    child_process.execSync(`aws lambda publish-version --function-name ${lambdaName} --description \'${description}\'`);
};

const downloadCode = function(codeLocation, callback) {
    const tempFileLocation = '/tmp/lambdoku-temp.zip';
    const tempLambdaZipStream = fs.createWriteStream(tempFileLocation);
    const request = http.get(codeLocation, function(response) {
        response.pipe(tempLambdaZipStream);
        response.on('end', function() {
            tempLambdaZipStream.end();
            callback(tempFileLocation);
        });
    });
};

commander
    .version('1.0')
    .option('-a, --lambda <lambdaName>', 'lambda to run operation on');

commander
    .command('help')
    .description('shows help')
    .action(function() {
        commander.help();
    });

commander
    .command('init <lambdaName>')
    .description('init directory for use with lambda')
    .action(function(lambdaName) {
        fs.writeFileSync(".lambdoku", lambdaName, {encoding: 'utf8'});
    });

commander
    .command('config')
    .description('get env configuration for lambda')
    .action(function() {
        const config = getFunctionEnvVariables(getLambdaName(commander), '$LATEST');
        for (const k in config) {
            console.log(`${k}='${config[k]}'`);
        }
    });

commander
    .command('config:unset <envName> [envName1...]')
    .description('unset env configuration value on lambda')
    .action(function(envName, otherEnvNames) {
        const lambdaName = getLambdaName(commander);
        const envs = getFunctionEnvVariables(lambdaName, '$LATEST');
        const envVarsToUnset = otherEnvNames.concat(envName)
        envVarsToUnset.forEach(function(envName) {
            if (!envs.hasOwnProperty(envName)) {
                throw new Error(`No env variable ${envName} set on lambda ${lambdaName}`);
            }
            delete envs[envName];
        });
        setFunctionConfiguration(lambdaName, envs);
        publishFunction(lambdaName, `Unsetting env variable ${envName}`);
    });

commander
    .command('config:set <envName=envValue> [envName1=envValue1...]')
    .description('set env configuration value of lambda')
    .action(function(assignment1, otherAssignments) {
        const lambdaName = getLambdaName(commander);
        const assignments = otherAssignments.concat(assignment1)
            .reduce(function(acc, assignment) {
                const splitted = assignment.split('=');
                if (splitted.length != 2) {
                    throw new Error(`Assignment ${assignment} in wrong form. Should be envName='envValue'.`);
                }
                acc[splitted[0]] = splitted[1];
                return acc;
            }, {});
        const newEnv = Object.assign({}, getFunctionEnvVariables(lambdaName, '$LATEST'), assignments);
        setFunctionConfiguration(lambdaName, newEnv);
        publishFunction(lambdaName, `Set env variables ${Object.keys(assignments)}`);
    });

commander
    .command('config:get <envName> [envName1...]')
    .description('get env configuration value of lambda')
    .action(function(envName1, otherEnvNames) {
        const envVariables = getFunctionEnvVariables(getLambdaName(commander), '$LATEST');
        const envs = otherEnvNames.concat(envName1)
            .reduce(function(acc, envName) {
                const envValue = envVariables[envName];
                if (envValue) {
                    acc[envName] = envValue;
                } else {
                    throw new Error(`No such env variable set ${envName}`);
                }
                return acc;
            }, {});
        for (k in envs) {
            console.log(`${k}=\'${envs[k]}\'`)
        }
    });

commander
    .command('downstream')
    .description('get downstream lambdas of given lambda')
    .action(function() {
        const lambdaName = getLambdaName(commander);
        const config = getFunctionEnvVariables(lambdaName, '$LATEST');
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.forEach(function(lambdaName) {
            console.log(lambdaName);
        });
    });

commander
    .command('downstream:add <downstreamLambdaName>')
    .description('add downstream to given lambda')
    .action(function(downstreamLambdaName) {
        const lambdaName = getLambdaName(commander);
        const config = getFunctionEnvVariables(lambdaName, '$LATEST');
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.push(downstreamLambdaName);
        config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
        setFunctionConfiguration(lambdaName, config);
        publishFunction(lambdaName, `Added downstream ${downstreamLambdaName}`);
    });

commander
    .command('downstream:remove <downstreamLambdaName>')
    .description('remove downstream from given lambda')
    .action(function(downstreamLambdaName) {
        const lambdaName = getLambdaName(commander);
        const config = getFunctionEnvVariables(lambdaName, '$LATEST');
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.splice(downstreamLambdas.indexOf(downstreamLambdaName), 1);
        config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
        setFunctionConfiguration(lambdaName, config);
        publishFunction(lambdaName, `Removed downstream ${downstreamLambdaName}`);
    });

commander
    .command('downstream:promote')
    .description('promote lambda to all its downstreams')
    .action(function() {
        const lambdaName = getLambdaName(commander);
        const functionCodeLocation = getFunctionCodeLocation(lambdaName, '$LATEST');
        const tempFileLocation = '/tmp/lambdoku-temp.zip';
        const tempLambdaZipStream = fs.createWriteStream(tempFileLocation);
        http.get(functionCodeLocation, function(response) {
            response.pipe(tempLambdaZipStream);
            response.on('end', function() {
                tempLambdaZipStream.end();
                const downstreamLambdas = extractDownstreamLambdas(getFunctionEnvVariables(lambdaName, '$LATEST'));
                downstreamLambdas.forEach(function(downstreamLambda) {
                    child_process.execSync(`aws lambda update-function-code --publish ` +
                        `--zip-file fileb://${tempFileLocation} --function-name ${downstreamLambda}`);
                });
            });
        });
    });

commander
    .command('releases')
    .description('lists releases of lambda')
    .action(function() {
        const lambdaName = getLambdaName(commander);
        const json = JSON.parse(child_process.execSync(`aws lambda list-versions-by-function --function-name ${lambdaName}`));
        json.Versions
            .reverse()
            .filter(function(version) {
                return version.Version !== '$LATEST';
            })
            .forEach(function(version) {
                console.log(`${version.Version} | ${version.Description} | ${version.LastModified}`);
            });
    });

commander
    .command('releases:rollback <version>')
    .description('rolls back to given version of lambda')
    .action(function(version) {
        const lambdaName = getLambdaName(commander);
        const codeLocation = getFunctionCodeLocation(lambdaName, version);
        downloadCode(codeLocation, function(codeFileName) {
            child_process.execSync(`aws lambda update-function-code --zip-file fileb://${codeFileName} ` +
                `--function-name ${lambdaName}`);
            setFunctionConfiguration(lambdaName, getFunctionEnvVariables(lambdaName, version));
            publishFunction(lambdaName, `Rolling back to version ${version}`);
        });
    });

commander
    .command('*')
    .action(function() {
        commander.help();
    });

commander.parse(process.argv);
