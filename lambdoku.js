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
    const lambdaArn = fs.readFileSync('.lambdoku', {encoding: 'utf8'});
    if (!lambdaArn) {
        throw new Error('No lambda as option or in .lambdoku file');
    }
    return lambdaArn;
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
        fs.writeFileSync(".lambdoku", lambdaName, errorHandler);
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
    .command('config:set <envName> <envValue>')
    .description('set env configuration value of lambda')
    .action(function(envName, envValue) {
        const lambdaName = getLambdaName(commander);
        const config = getFunctionEnvVariables(lambdaName, '$LATEST');
        config[envName] = envValue;
        setFunctionConfiguration(lambdaName, config);
        publishFunction(lambdaName, `Set env variable ${envName}`);
    });

commander
    .command('config:unset <envName>')
    .description('unset env configuration value on lambda')
    .action(function(envName) {
        const lambdaName = getLambdaName(commander);
        const config = getFunctionEnvVariables(lambdaName, '$LATEST');
        if (!config.hasOwnProperty(envName)) {
            throw new Error(`No env variable ${envName} set on lambda ${lambdaName}`);
        }
        delete config[envName];
        setFunctionConfiguration(lambdaName, config);
        publishFunction(lambdaName, `Unsetting env variable ${envName}`);
    });

commander
    .command('config:get <envName>')
    .description('get env configuration value of lambda')
    .action(function(envName) {
        const envValue = getFunctionEnvVariables(getLambdaName(commander), '$LATEST')[envName];
        if (envValue) {
            console.log(envValue);
        } else {
            console.log(`No such env variable set ${envName}`);
            process.exit(1);
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
