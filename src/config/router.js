const { routerExtension, ActionTransport } = require('@microfleet/core');
const path = require('path');
const tokenAuth = require('ms-users/lib/auth/strategy.bearer');

const autoSchema = routerExtension('validate/schemaLessAction');
const auditLog = routerExtension('audit/log');
const metrics = routerExtension('audit/metrics');

module.exports = {
  router: {
    routes: {
      directory: path.resolve(__dirname, '..', 'actions'),
      prefix: 'payments',
      setTransportsAsDefault: false,
      transports: [ActionTransport.amqp, ActionTransport.http, ActionTransport.internal],
      enabledGenericActions: ['health'],
    },
    extensions: {
      enabled: ['postRequest', 'preRequest', 'preResponse', 'postResponse'],
      register: [autoSchema, auditLog(), metrics()],
    },
    auth: {
      strategies: {
        token: tokenAuth,
      },
    },
  },
};
