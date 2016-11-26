# Lambdoku

Heroku-like experience with AWS Lambdas.

## Features

### Connecting current directory with lambda (like `heroku git:remote`)

```
$ lambdoku init someLambda
```

this allows you to omit the `-a` param for all commands below


### Simplified environment variables management (`heroku config`)

```
$ lambdoku config:set ONE=1 TWO=2

$ lambdoku config
ONE='1'
TWO='2'

$ lambdoku config:get ONE
ONE='1'
```

### Simplified releases management (`heroku releases`)

```
$ lambdoku releases
22 | Setting env variables AA | 2016-11-26T21:12:46.894+0000
21 | Unsetting env variables XY | 2016-11-26T21:10:04.302+0000
20 | Setting env variables BB,XY | 2016-11-26T20:57:57.340+0000
...

$ lambdoku releases:rollback 18

$ lambdoku releases
23 | Rolling back to version 18 | 2016-11-26T21:35:45.952+0000
22 | Setting env variables AA | 2016-11-26T21:12:46.894+0000
21 | Unsetting env variables XY | 2016-11-26T21:10:04.302+0000
20 | Setting env variables BB,XY | 2016-11-26T20:57:57.340+0000
...
```

in the example :point_up: both code and configuration is rolled back from version 18.

### Pipelines (`heroku pipelines`)

(actually the main reason why lambdoku was created)

```
$ lambdoku downstream:add sampleDownstreamLambda1

$ lambdoku downstream:add sampleDownstreamLambda2

$ lambdoku downstream
sampleDownstreamLambda1
sampleDownstreamLambda2

$ lambdoku downstream:promote
```

now both downstream lambdas have code copied from current lambda.

## Installation

Simply:
```
npm install -g lambdoku
```

make sure you have a modern node.js installation (ES6 is needed). 

Additionally you will need a configured `aws-cli` installation on your computer: https://aws.amazon.com/cli/

## Internals (aka 'how it works?')
 * it's simply an abstraction layer over AWS Lambda API effectively invoking `aws-cli`
 * each change applied to lambda is finished with lambda version publication
 * the `rollback` and `promote` operations retrieve code from AWS and uploads it in place of current one
 * pipelines use special env variable (please :pray: don't use it :)) `DOWNSTREAM_LAMBDAS` to the dowstreams

## Known issues

Due to the nature of AWS Lambda API most of the operations can't be considered atomic, like:
  * the change in configuration has to first retrieve current configuration - which may be change in the mean time
  * the rollback can be infected with change done in configuration in the 'mean time'
  * the pipelines promote can be infected by changes done at the same time on downstream
