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
        const lambdaArn = getLambdaArn(commander);
        const command = `aws lambda get-function-configuration --function-name ${lambdaArn}`
        const jsonized = JSON.parse(child_process.execSync(command, {encoding: 'utf8'}));
        for (const k in jsonized.Environment.Variables) {
            console.log(`${k}='${jsonized.Environment.Variables[k]}'`)
        }
    });

commander.parse(process.argv);
