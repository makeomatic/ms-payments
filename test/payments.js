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

function debug(result) {
  if (result.isRejected()) {
    console.log(require("util").inspect(result, { depth: 5 }))
  }
}

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
  const Payments = require('../src/payments.js');

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

  describe('unit tests', function UnitSuite() {
    this.timeout(100000) // paypal is slow

    const createPlanHeaders = { routingKey: Payments.defaultOpts.postfix.plan.create };
    const deletePlanHeaders = { routingKey: Payments.defaultOpts.postfix.plan.delete };
    const listPlanHeaders = { routingKey: Payments.defaultOpts.postfix.plan.list };
    const updatePlanHeaders = { routingKey: Payments.defaultOpts.postfix.plan.update };
    const statePlanHeaders = { routingKey: Payments.defaultOpts.postfix.plan.state };

    const createAgreementHeaders = { routingKey: Payments.defaultOpts.postfix.agreement.create };
    const executeAgreementHeaders = { routingKey: Payments.defaultOpts.postfix.agreement.execute };

    let plan_id
    let payments
    let agreement_id
    let agreement_token

    const testPlan = {
      name: "test plan",
      description: "test plan",
      type: "fixed",
      payment_definitions: [{
        name: "test definition",
        type: "regular",
        frequency_interval: "1",
        frequency: "month",
        cycles: "3",
        amount: {
          currency: "RUB",
          value: "50"
        },
        charge_models: [{
          type: "shipping",
          amount: {
            "currency": "RUB",
            "value": "0"
          }
        }]
      }],
      merchant_preferences: {
        "cancel_url": "http://cancel.com",
        "return_url": "http://return.com"
      }
    }

    const testAgreement = {
      name: "test agreement",
      description: "test agreement",
      start_date: "2017-12-01T00:00:00Z",
      payer: {
        payment_method: "paypal"
      },
      plan: {
        id: plan_id
      }
    }

    before(redisMock);

    before(function startService() {
      function emptyStub() {}

      payments = new Payments(config);
      payments._mailer = {
        send: emptyStub,
      };
      payments._redis = {};
      [
        'hexists', 'hsetnx', 'pipeline', 'expire', 'zadd', 'hgetallBuffer', 'get',
        'set', 'hget', 'hdel', 'del', 'hmgetBuffer', 'incrby', 'zrem', 'zscoreBuffer', 'hmget',
        'hset',
      ].forEach(prop => {
        payments._redis[prop] = emptyStub;
      });
    });

    /*describe('plans#', function plansSuite() {
      it('Should fail to create on invalid plan schema', () => {
        const data = {
          something: "useless"
        }

        return payments.router(data, createPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should create a plan', () => {
        return payments.router(testPlan, createPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isFulfilled()).to.be.eq(true)
            expect(result.value()).to.have.ownProperty("id")
            plan_id = result.value().id
          })
      })
      it('Should fail to activate on an unknown plan id', () => {
        return payments.router({"id": "random", "state": "active"}, statePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
          })
      })
      it('Should fail to activate on an invalid state', () => {
        return payments.router({"id": "random", "state": "invalid"}, statePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should activate the plan', () => {
        return payments.router({"id": plan_id, "state": "active"}, statePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isFulfilled()).to.be.eq(true)
          })
      })
      it('Should fail to update on an unknown plan id', () => {
        return payments.router({"id": "random", "plan": {}}, updatePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should fail to update on invalid plan schema', () => {
        return payments.router({"id": plan_id, "plan": { "invalid": true }}, updatePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should update plan info', () => {
        return payments.router({"id": plan_id, "query": [{
          "path": "/",
          "op": "replace",
          "value": {
            "state": "inactive"
          }
        }]}, updatePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isFulfilled()).to.be.eq(true)
          })
      })
      it('Should fail to list on invalid query schema', () => {
        return payments.router({
          "status": "invalid"
        }, listPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should list all plans', () => {
        return payments.router({}, listPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isFulfilled()).to.be.eq(true)
          })
      })
      it('Should fail to delete on an unknown plan id', () => {
        return payments.router("random_id", deletePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
          })
      })
      it('Should delete plan', () => {
        return payments.router(plan_id, deletePlanHeaders)
          .reflect()
          .then((result) => {
            debug(result)
            expect(result.isFulfilled()).to.be.eq(true)
          })
      })
    })*/

    describe('agreements#', function agreementsSuite() {

      before(() => {
        return payments.router(testPlan, createPlanHeaders).then((plan) => {
          plan_id = plan.id
          return payments.router({"id": plan_id, "state": "active"}, statePlanHeaders)
        })
      })

      it('Should fail to create agreement on invalid schema', () => {
        return payments.router({ "random": true }, createAgreementHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
            expect(result.reason().name).to.be.eq("ValidationError")
          })
      })
      it('Should create an agreement', () => {
        testAgreement.plan.id = plan_id
        console.log(testAgreement)
        return payments.router(testAgreement, createAgreementHeaders)
          .reflect()
          .then((result) => {
            debug(result)
            expect(result.isFulfilled()).to.be.eq(true)
            agreement_token = result.value().token
          })
      })
      it('Should fail to execute on an unknown token', () => {
        return payments.router("random token", executeAgreementHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
          })
      })
      it('Should reject unapproved agreement', () => {
        return payments.router(agreement_token, executeAgreementHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true)
          })
      })
      it('Should execute an approved agreement', () => {
        return payments.router(agreement_token, executeAgreementHeaders)
          .reflect()
          .then((result) => {
            debug(result)
            expect(result.isFulfilled()).to.be.eq(true)
          })
      })

      after(() => {
        return payments.router(plan_id, deletePlanHeaders)
      })

    })

    after(tearDownRedisMock);
  });
});
