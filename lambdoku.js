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

const getFunctionConfiguration = function(lambdaArn) {
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
        const config = getFunctionConfiguration(getLambdaArn(commander));
        for (const k in config) {
            console.log(`${k}='${config[k]}'`)
        }
    });

commander
    .command('config:set <envName> <envValue>')
    .description('set configuration value of lambda')
    .action(function(envName, envValue) {
        const lambdaArn = getLambdaArn(commander);
        const config = getFunctionConfiguration(lambdaArn);
        config[envName] = envValue;
        setFunctionConfiguration(lambdaArn, config);
    });

commander.parse(process.argv);