class BillingIncompleteError extends Error {
  constructor() {
    super('Billing incomplete. Agreement state is active, but there is no outstanding transactions. Please retry later.');
  }
}

module.exports = BillingIncompleteError;
