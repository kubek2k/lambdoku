# Lambdoku

Heroku-like experience with AWS Lambdas.

## Features

### Connecting current directory with lambda (like `heroku git:remote`)

```shell
$ lambdoku init <ARN-of-your-lambda-function>
```

this allows you to omit the `-a` param for all commands below

### Simple push of the zip/jar file

```
$ lambdoku push hello.zip
```

### Simplified environment variables management (`heroku config`)

```shell
$ lambdoku config:set ONE=1 TWO=2

$ lambdoku config
ONE='1'
TWO='2'

$ lambdoku config:get ONE
ONE='1'
```

### Simplified releases management (`heroku releases`)

```shell
$ lambdoku releases
22 | Setting env variables AA | 2016-11-26T21:12:46.894+0000
21 | Unsetting env variables XY | 2016-11-26T21:10:04.302+0000
20 | Setting env variables BB,XY | 2016-11-26T20:57:57.340+0000
...

$ lambdoku rollback 18

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

```shell
$ lambdoku init lambdaDev

$ lambdoku pipeline:add lambdaStage

$ lambdoku pipeline:add lambdaProd -a lambdaStage

$ lambdoku pipeline
lambdaStage

$ lambdoku pipeline:promote
```

now `lambdaDev` and `lambdaStage` have the same codebase. 
`lambdaStage` can be promoted to `lambdaProd` with command `lambdoku downstream:promote -a lambdaStage`.

### Logs

To get 100 latest log lines from all lambda invocations:

```shell
$ lambdoku logs -n 100
```

To follow logs produced by all lambda invocations:
```shell
$ lambdoku -f 
```

### Invoking lambda

To invoke lambda to test if it works, you can use:

```shell
lambdoku invoke
```

## Installation

1. _Prerequisite:_ AWS Environment variables
   * Set required variables:
     * `AWS_ACCESS_KEY_ID`
     * `AWS_SECRET_ACCESS_KEY`
     * `AWS_DEFAULT_REGION`
2. _Prerequisite:_ Node and npm _(ES6 support required)_
   * On OS X with homebrew: `brew update && brew install node`
3. Then, simply:

   ```shell
   npm install -g lambdoku
   ```

## Internals (aka 'how it works?')
 * it's simply an abstraction layer over AWS Lambda API effectively invoking `aws-sdk`
 * each change applied to lambda is finished with lambda version publication
 * the `rollback` and `promote` operations retrieve code from AWS and uploads it in place of current one
 * pipelines use special env variable (please :pray: don't use it :)) `DOWNSTREAM_LAMBDAS` to the dowstreams

## Known issues

Due to the nature of AWS Lambda API most of the operations can't be considered atomic, like:
  * the change in configuration has to first retrieve current configuration - which may be change in the meantime
  * the rollback can be infected with change done in configuration in the 'meantime'
  * the pipelines promote can be infected by changes done at the same time on downstream
