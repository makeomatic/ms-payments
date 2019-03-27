const assert = require('assert');

const config = require('../config');

describe('balance', function suite() {
  const Payments = require('../../src');

  before('start service', async () => {
    this.service = new Payments(config);
    await this.service.connect();
  });

  describe('actions', () => {
    const owner = String(Date.now());

    it('should create stripe charge and top up the balance', async () => {
      const params = {
        owner,
        token: 'tok_mastercard',
        amount: 100,
        description: 'Feed the cat',
        saveCard: true,
        email: 'perchik@cat.com' };

      const result = await this.service.amqp.publishAndWait('payments.charges.stripe.create', params);

      console.log(result)
    });

    it('should be able to get charges list', async () => {
      const result = await this.service.amqp.publishAndWait('payments.charges.list', { owner });

      console.log(result)
    });
  });
});
