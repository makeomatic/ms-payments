module.exports = {
  urls: {
    $filter: 'env',
    test: {
      plan_return: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-return',
      plan_cancel: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-cancel',
      plan_notify: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-notify',
      sale_return: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-return',
      sale_cancel: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-cancel',
      sale_notify: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-notify',
      payments_return: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-return',
      payments_cancel: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-cancel',
    },
  },
};
