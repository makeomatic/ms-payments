const assertStringNotEmpty = require('../asserts/string-not-empty');

class Intents {
  constructor(client) {
    this.client = client;
  }

  async setup(stripeCustomerId) {
    assertStringNotEmpty(stripeCustomerId, 'stripeCustomerId is invalid');

    const params = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    };

    return this.client.request('setupIntents.create', [params]);
  }
}

module.exports = Intents;
