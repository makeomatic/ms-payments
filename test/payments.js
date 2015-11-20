const URLSafeBase64 = require('urlsafe-base64');
const Promise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;
const MockServer = require('ioredis/test/helpers/mock_server.js');
const Errors = require('common-errors');
const ld = require('lodash');

// make sure we have stack
chai.config.includeStack = true;

const config = {
  amqp: {
    connection: {
      host: process.env.RABBITMQ_PORT_5672_TCP_ADDR || '127.0.0.1',
      port: +process.env.RABBITMQ_PORT_5672_TCP_PORT || 5672,
    },
  },
  redis: {
    hosts: [
      {
        host: process.env.REDIS_1_PORT_6379_TCP_ADDR || '127.0.0.1',
        port: +process.env.REDIS_1_PORT_6379_TCP_PORT || 30001,
      },
      {
        host: process.env.REDIS_2_PORT_6379_TCP_ADDR || '127.0.0.1',
        port: +process.env.REDIS_2_PORT_6379_TCP_PORT || 30002,
      },
      {
        host: process.env.REDIS_3_PORT_6379_TCP_ADDR || '127.0.0.1',
        port: +process.env.REDIS_3_PORT_6379_TCP_PORT || 30003,
      },
    ],
  },
};

describe('Payments suite', function UserClassSuite() {
  const Payment = require('../src/payments.js');

  // inits redis mock cluster
  function redisMock() {
    const slotTable = [
      [0, 5460, ['127.0.0.1', 30001]],
      [5461, 10922, ['127.0.0.1', 30002]],
      [10923, 16383, ['127.0.0.1', 30003]],
    ];

    function argvHandler(argv) {
      if (argv[0] === 'cluster' && argv[1] === 'slots') {
        return slotTable;
      }
    }

    this.server_1 = new MockServer(30001, argvHandler);
    this.server_2 = new MockServer(30002, argvHandler);
    this.server_3 = new MockServer(30003, argvHandler);
  }

  // teardown cluster
  function tearDownRedisMock() {
    this.server_1.disconnect();
    this.server_2.disconnect();
    this.server_3.disconnect();
  }

  describe('configuration suite', function ConfigurationSuite() {
    beforeEach(redisMock);

    it('must throw on invalid configuration', function test() {
      expect(function throwOnInvalidConfiguration() {
        return new Payments();
      }).to.throw(Errors.ValidationError);
    });

    it('must be able to connect to and disconnect from amqp', function test() {
      const payments = new Payments(config);
      return payments._connectAMQP().tap(() => {
        return payments._closeAMQP();
      });
    });

    it('must be able to connect to and disconnect from redis', function test() {
      const payments = new Payments(config);
      return payments._connectRedis().tap(() => {
        return payments._closeRedis();
      });
    });

    it('must be able to initialize and close service', function test() {
      const payments = new Payments(config);
      return payments.connect().tap(() => {
        return payments.close();
      });
    });

    afterEach(tearDownRedisMock);
  });

  describe('unit tests', function UnitSuite() {
    beforeEach(redisMock);

    beforeEach(function startService() {
      function emptyStub() {}

      this.payments = new Payments(config);
      this.payments._mailer = {
        send: emptyStub,
      };
      this.payments._redis = {};
      [
        'hexists', 'hsetnx', 'pipeline', 'expire', 'zadd', 'hgetallBuffer', 'get',
        'set', 'hget', 'hdel', 'del', 'hmgetBuffer', 'incrby', 'zrem', 'zscoreBuffer', 'hmget',
        'hset',
      ].forEach(prop => {
        this.payments._redis[prop] = emptyStub;
      });
    });

    describe('plans#', function plansSuite() {

      it('Should fail to create on invalid plan schema')
      it('Should create a plan')
      it('Should fail to activate on an unknown plan id')
      it('Should activate the plan')
      it('Should fail to update on an unknown plan id')
      it('Should fail to update on invalid plan schema')
      it('Should update plan info')
      it('Should fail to list on invalid query schema')
      it('Should list all plans')
      it('Should fail to delete on an unknown plan id')
      it('Should delete plan')

    })

    describe('agreements#', function agreementsSuite() {

      it('Should fail to create agreement on invalid schema')
      it('Should create an agreement')
      it('Should fail to execute on an unknown token')
      it('Should reject unapproved agreement')
      it('Should execute an approved agreement')

    })

    afterEach(tearDownRedisMock);
  });
});
