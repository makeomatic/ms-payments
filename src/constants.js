// this file contains list of constants used throughout the
// app

module.exports = {
  SALES_ID_INDEX: 'sales-index',
  SALES_DATA_PREFIX: 'sales-data',
  TRANSACTIONS_INDEX: 'all-transactions',
  TRANSACTIONS_COMMON_DATA: 'all-transactions:meta',
  AGREEMENT_INDEX: 'agreements-index',
  AGREEMENT_DATA: 'agreements-data',
  AGREEMENT_TRANSACTIONS_INDEX: 'transactions',
  PER_AGREEMENT_TX_IDX: 'agr:tx-idx',
  AGREEMENT_TRANSACTIONS_DATA: 'transactions:meta',
  TRANSACTION_TYPE_RECURRING: 0,
  TRANSACTION_TYPE_SALE: 1,
  TRANSACTION_TYPE_3D: 2,
  PAYPAL_DATE_FORMAT: 'YYYY-MM-DD[T]HH:mm:ss[Z]',
  PLANS_DATA: 'plans-data',
  PLANS_INDEX: 'plans-index',
  FREE_PLAN_ID: 'free',

  // field constant
  PLAN_ALIAS_FIELD: 'alias',
  AGR_TX_FIELD: 't',
  ARG_AGR_ID_FIELD: 'agreement',
  // Shared lock keys for actions
  // create one lock for all actions that update user metadata for payment method
  LOCK_EDIT_PAYMENT_METHOD: 'tx!edit:payment:method',
};
