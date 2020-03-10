const { router: { routes: { prefix } } } = require('../../src/config/router');

const routesPaypal = {
  createPlan: `${prefix}.plan.create`,
  getPlan: `${prefix}.plan.get`,
  updatePlan: `${prefix}.plan.update`,
  deletePlan: `${prefix}.plan.delete`,
  listPlan: `${prefix}.plan.list`,
  statePlan: `${prefix}.plan.state`,
  createAgreement: `${prefix}.agreement.create`,
  getAgreement: `${prefix}.agreement.get`,
  executeAgreement: `${prefix}.agreement.execute`,
  stateAgreement: `${prefix}.agreement.state`,
  listAgreement: `${prefix}.agreement.list`,
  forUserAgreement: `${prefix}.agreement.forUser`,
  syncAgreements: `${prefix}.agreement.sync`,
  syncTransaction: `${prefix}.transaction.sync`,
  listTransaction: `${prefix}.transaction.list`,
  aggregateTransactions: `${prefix}.transaction.aggregate`,
  listCommonTransactions: `${prefix}.transaction.common`,
  createSale: `${prefix}.sale.create`,
  createDynamicSale: `${prefix}.sale.createDynamic`,
  executeSale: `${prefix}.sale.execute`,
  listSale: `${prefix}.sale.list`,
  decrementBalance: `${prefix}.balance.decrement`,
};

module.exports = { routesPaypal };
