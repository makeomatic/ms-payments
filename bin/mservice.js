#!/usr/bin/env node

'use strict';

// accepts conf through .env file
// suitable for configuring this in the docker env
const configuration = require('ms-conf').get('/');

let dir;
try {
  require('heapdump');
  require('babel-register');
  dir = '../src';
} catch (e) {
  dir = '../lib';
}

const Service = require(dir);
const service = new Service(configuration);
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
