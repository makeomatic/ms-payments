#!/usr/bin/env node

'use strict';

// accepts conf through .env file
// suitable for configuring this in the docker env
const configuration = require('ms-conf');

let dir;
if (process.env.NODE_ENV === 'production') {
  dir = '../lib';
} else {
  dir = '../src';
  require('babel-register');
}

const Service = require(dir);
const service = new Service(configuration.get('/'));
service.connect()
  .then(function serviceUp() {
    service.log.info('Started service');
    return service.initPlans();
  })
  .then(function syncTransactions() {
    return service.syncTransactions();
  })
  .catch(function serviceCrashed(err) {
    service.log.fatal('Failed to start service', err);
    setImmediate(function escapeTryCatch() {
      throw err;
    });
  });
