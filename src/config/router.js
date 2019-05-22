const { routerExtension, ActionTransport } = require('@microfleet/core');
const path = require('path');
const tokenAuth = require('ms-users/lib/auth/strategy.bearer');

const autoSchema = routerExtension('validate/schemaLessAction');
const auditLog = routerExtension('audit/log');

module.exports = {
  router: {
    routes: {
      directory: path.resolve(__dirname, '..', 'actions'),
      prefix: 'payments',
      setTransportsAsDefault: false,
      transports: [ActionTransport.amqp, ActionTransport.http],
      enabledGenericActions: ['health'],
    },
    extensions: {
      enabled: ['postRequest', 'preRequest', 'preResponse'],
      register: [autoSchema, auditLog()],
    },
    auth: {
      strategies: {
        token: tokenAuth,
      },
    },
  },
};
