const uuid = require('uuid/v4');

function modelResponse(data) {
  return {
    data: {
      type: 'stripe-payment-intent',
      id: uuid(),
      attributes: {
        clientSecret: data.client_secret,
      },
    },
  };
}

module.exports = {
  modelResponse,
};
