// this file contains list of constants used throughout the
// app

module.exports = {
  AGREEMENT_DATA: 'agreements-data',
  AGREEMENT_INDEX: 'agreements-index',
  AGREEMENT_KEYS: ['agreement', 'plan', 'owner', 'state'],
  AGREEMENT_PENDING_STATUS: JSON.stringify('pending'),
  AGREEMENT_PENDING_STATUS_CAPITAL: JSON.stringify('Pending'),
  AGREEMENT_TRANSACTIONS_DATA: 'transactions:meta',
  AGREEMENT_TRANSACTIONS_INDEX: 'transactions',
  FETCH_USERS_LIMIT: 20,
  FIND_OWNER_REGEXP: /\[([^\]]+)\]/,
  FREE_PLAN_ID: 'free',
  PAYPAL_DATE_FORMAT: 'YYYY-MM-DD[T]HH:mm:ss[Z]',
  PLANS_DATA: 'plans-data',
  PLANS_INDEX: 'plans-index',
  PLAN_ALIAS_FIELD: 'alias',
  PLAN_KEYS: ['subs'],
  SALES_DATA_PREFIX: 'sales-data',
  SALES_ID_INDEX: 'sales-index',
  SUBSCRIPTION_TYPE_CAPP: JSON.stringify('capp'),
  TRANSACTIONS_COMMON_DATA: 'all-transactions:meta',
  TRANSACTIONS_INDEX: 'all-transactions',
  TRANSACTIONS_LIMIT: 20,
  TRANSACTION_TYPE_3D: 2,
  TRANSACTION_TYPE_RECURRING: 0,
  TRANSACTION_TYPE_SALE: 1,
};
