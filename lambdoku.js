#!/usr/bin/env node

const commander = require('commander');
const fs = require('fs');
const child_process = require('child_process');

const errorHandler = function(err) {
    console.log(err, err.stack);
    process.exit(1);
};

const getLambdaArn = function(commander) {
    if (commander.lambda) {
        return commander.lambda;
    }
    const lambdaArn = fs.readFileSync('.lambdoku', {encoding: 'utf8'});
    if (!lambdaArn) {
        throw new Error('No lambda as option or in .lambdoku file');
    }
    return lambdaArn;
};

const getFunctionEnvVariables = function(lambdaArn) {
    const command = `aws lambda get-function-configuration --function-name ${lambdaArn}`;
    return JSON.parse(child_process.execSync(command, {encoding: 'utf8'})).Environment.Variables;
};

const setFunctionConfiguration = function(lambdaArn, config) {
    const jsonConfig = JSON.stringify({
        Variables: config
    });
    const command = `aws lambda update-function-configuration --function-name ${lambdaArn} --environment \'${jsonConfig}\'`;
    child_process.execSync(command, {encoding: 'utf8'});
};

const extractDownstreamLambdas = function(config) {
    const configStringVal = config['DOWNSTREAM_LAMBDAS'] || '';
    return configStringVal.length > 0 ? configStringVal.split(';') : [];
};

commander
    .version('1.0')
    .option('-a, --lambda <lambdaArn>', 'lambda to run operation on');

commander
    .command('init <lambdaArn>')
    .description('init directory for use with lambda')
    .action(function(lambdaArn) {
        fs.writeFileSync(".lambdoku", lambdaArn, errorHandler);
    });

commander
    .command('config')
    .description('get env configuration for lambda')
    .action(function() {
        const config = getFunctionEnvVariables(getLambdaArn(commander));
        for (const k in config) {
            console.log(`${k}='${config[k]}'`)
        }
    });

commander
    .command('config:set <envName> <envValue>')
    .description('set env configuration value of lambda')
    .action(function(envName, envValue) {
        const lambdaArn = getLambdaArn(commander);
        const config = getFunctionEnvVariables(lambdaArn);
        config[envName] = envValue;
        setFunctionConfiguration(lambdaArn, config);
    });

commander
    .command('config:get <envName>')
    .description('get env configuration value of lambda')
    .action(function(envName) {
        const lambdaArn = getLambdaArn(commander);
        const envValue = getFunctionEnvVariables(lambdaArn)[envName];
        if (envValue) {
            console.log(envValue);
        } else {
            console.log(`No such env variable set ${envName}`);
            process.exit(1);
        }
    });

commander
    .command('downstream:add <downstreamLambdaArn>')
    .description('add lambda ARN as downstream to given lambda')
    .action(function(downstreamLambdaArn) {
        const lambdaArn = getLambdaArn(commander);
        const config = getFunctionEnvVariables(lambdaArn);
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.push(downstreamLambdaArn);
        config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
        setFunctionConfiguration(lambdaArn, config);
    });

commander
    .command('downstream:remove <downstreamLambdaArn>')
    .description('remove lambda ARN from given lambda')
    .action(function(downstreamLambdaArn) {
        const lambdaArn = getLambdaArn(commander);
        const config = getFunctionEnvVariables(lambdaArn);
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.splice(downstreamLambdas.indexOf(downstreamLambdaArn), 1);
        config['DOWNSTREAM_LAMBDAS'] = downstreamLambdas.join(';');
        setFunctionConfiguration(lambdaArn, config);
    });

commander
    .command('downstream')
    .description('get downstream lambdas of given lambda')
    .action(function() {
        const lambdaArn = getLambdaArn(commander);
        const config = getFunctionEnvVariables(lambdaArn);
        const downstreamLambdas = extractDownstreamLambdas(config);
        downstreamLambdas.forEach(function(lambdaArn) {
             console.log(lambdaArn);
        });
    });

commander.parse(process.argv);
