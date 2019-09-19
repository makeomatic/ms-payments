const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const has = require('lodash/has');
const get = require('lodash/get');

const acquireLock = require('../acquire-lock');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');

function assertPathExists(object, path) {
  if (has(object, path) !== true) {
    throw new HttpStatusError(500, `Acquire lock error: path ${path} not found in request`);
  }
}

function acquireLockWrapper(request, action, keyPrefix, ...requestKeyPaths) {
  const keyParts = [keyPrefix];

  for (const path of requestKeyPaths) {
    assertPathExists(request, path);

    keyParts.push(get(request, path));
  }

  const lock = acquireLock(this, keyParts.join(':'));

  return Promise
    .using(this, request, lock, () => action.call(this, request, lock))
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

module.exports = (action, keyPrefix, ...requestKeyPaths) => function actionLockWrapper(request) {
  return acquireLockWrapper.call(this, request, action, keyPrefix, ...requestKeyPaths);
};
