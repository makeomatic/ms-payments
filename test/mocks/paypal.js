const nock = require('nock');

nock('https://api.sandbox.paypal.com')
  .post('/v1/oauth2/token', 'grant_type=client_credentials')
  .reply(200, {
    'scope': 'openid https://uri.paypal.com/services/invoicing https://uri.paypal.com/services/subscriptions https://api.paypal.com/v1/payments/.* https://api.paypal.com/v1/vault/credit-card/.* https://api.paypal.com/v1/vault/credit-card',
    'access_token': 'A015FCC322yoZ8Rjb74XpLS7wgWCkPpBZ0fiA9suvclx6kE',
    'token_type': 'Bearer',
    'app_id': 'APP-80W284485P519543T',
    'expires_in': 28800,
  }, {
    server: 'Apache-Coyote/1.1',
    proxy_server_info: 'host=slcsbjava2.slc.paypal.com;threadId=127',
    'paypal-debug-id': '4f9c1f2c0d206',
    server_info: 'identitysecuretokenserv:v1.oauth2.token&CalThreadId=126527&TopLevelTxnStartTime=1472080abf4&Host=slcsbidensectoken502.slc.paypal.com&pid=29059',
    date: 'Thu, 10 Jul 2014 13:40:09 GMT',
    'content-type': 'application/json',
    'content-length': '374',
  });

nock('https://api.sandbox.paypal.com')
  .post('/v1/payments/billing-plans/', {
    'description': 'Create Plan for Regular',
    'merchant_preferences': {
      'auto_bill_amount': 'yes',
      'cancel_url': 'http://www.cancel.com',
      'initial_fail_amount_action': 'continue',
      'max_fail_attempts': '1',
      'return_url': 'http://www.success.com',
      'setup_fee': {'currency': 'USD', 'value': '25'}
    },
    'name': 'Testing1-Regular1',
    'payment_definitions': [{
      'amount': {'currency': 'USD', 'value': '100'},
      'charge_models': [{
        'amount': {'currency': 'USD', 'value': '10.60'},
        'type': 'SHIPPING',
      }, {'amount': {'currency': 'USD', 'value': '20'}, 'type': 'TAX'}],
      'cycles': '0',
      'frequency': 'MONTH',
      'frequency_interval': '1',
      'name': 'Regular 1',
      'type': 'regular',
    }, {
      'amount': {'currency': 'USD', 'value': '20'},
      'charge_models': [{
        'amount': {'currency': 'USD', 'value': '10.60'},
        'type': 'SHIPPING',
      }, {'amount': {'currency': 'USD', 'value': '20'}, 'type': 'TAX'}],
      'cycles': '4',
      'frequency': 'MONTH',
      'frequency_interval': '1',
      'name': 'Trial 1',
      'type': 'trial',
    }],
    'type': 'infinite',
  })
  .reply(201, {
    'id': 'P-12U98928TT9129128ECALAJY',
    'state': 'CREATED',
    'name': 'Testing1-Regular1',
    'description': 'Create Plan for Regular',
    'type': 'INFINITE',
    'payee': {'merchant_id': '2254677669463764251'},
    'payment_definitions': [{
      'id': 'PD-3EC60609HF4313133ECALAJY',
      'name': 'Regular 1',
      'type': 'REGULAR',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '100'},
      'charge_models': [{
        'id': 'CHM-3WR87858RT4036731ECALAJY',
        'type': 'SHIPPING',
        'amount': {'currency': 'USD', 'value': '10.6'}
      }, {'id': 'CHM-7XR090190M4848722ECALAJY', 'type': 'TAX', 'amount': {'currency': 'USD', 'value': '20'}}],
      'cycles': '0',
      'frequency_interval': '1'
    }, {
      'id': 'PD-8NT01713C33262114ECALAJY',
      'name': 'Trial 1',
      'type': 'TRIAL',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '20'},
      'charge_models': [{
        'id': 'CHM-0XR31434AS9044537ECALAJY',
        'type': 'SHIPPING',
        'amount': {'currency': 'USD', 'value': '10.6'}
      }, {'id': 'CHM-30159882YH277305AECALAJY', 'type': 'TAX', 'amount': {'currency': 'USD', 'value': '20'}}],
      'cycles': '4',
      'frequency_interval': '1'
    }],
    'merchant_preferences': {
      'setup_fee': {'currency': 'USD', 'value': '25'},
      'max_fail_attempts': '1',
      'return_url': 'http://www.success.com',
      'cancel_url': 'http://www.cancel.com',
      'auto_bill_amount': 'YES',
      'initial_fail_amount_action': 'CONTINUE'
    },
    'create_time': '2014-07-10T13:40:10.407Z',
    'update_time': '2014-07-10T13:40:10.407Z',
    'links': [{
      'href': 'https://api.sandbox.paypal.com/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY',
      'rel': 'self',
      'method': 'GET'
    }]
  }, {
    server: 'Apache-Coyote/1.1',
    proxy_server_info: 'host=slcsbjava2.slc.paypal.com;threadId=127',
    'paypal-debug-id': '8bb21ab20d65b',
    server_info: 'paymentsplatformserv:v1.payments.billing-plans&CalThreadId=23732&TopLevelTxnStartTime=1472080b01b&Host=slcsbjm2.slc.paypal.com&pid=31339',
    'content-language': '*',
    date: 'Thu, 10 Jul 2014 13:40:09 GMT',
    'content-type': 'application/json',
    'content-length': '1415'
  });

nock('https://api.sandbox.paypal.com')
  .get('/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY')
  .reply(200, {
    'id': 'P-12U98928TT9129128ECALAJY',
    'state': 'CREATED',
    'name': 'Testing1-Regular1',
    'description': 'Create Plan for Regular',
    'type': 'INFINITE',
    'payee': {'merchant_id': '2254677669463764251'},
    'payment_definitions': [{
      'id': 'PD-3EC60609HF4313133ECALAJY',
      'name': 'Regular 1',
      'type': 'REGULAR',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '100'},
      'charge_models': [{
        'id': 'CHM-7XR090190M4848722ECALAJY',
        'type': 'TAX',
        'amount': {'currency': 'USD', 'value': '20'}
      }, {'id': 'CHM-3WR87858RT4036731ECALAJY', 'type': 'SHIPPING', 'amount': {'currency': 'USD', 'value': '10.6'}}],
      'cycles': '0',
      'frequency_interval': '1'
    }, {
      'id': 'PD-8NT01713C33262114ECALAJY',
      'name': 'Trial 1',
      'type': 'TRIAL',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '20'},
      'charge_models': [{
        'id': 'CHM-30159882YH277305AECALAJY',
        'type': 'TAX',
        'amount': {'currency': 'USD', 'value': '20'}
      }, {'id': 'CHM-0XR31434AS9044537ECALAJY', 'type': 'SHIPPING', 'amount': {'currency': 'USD', 'value': '10.6'}}],
      'cycles': '4',
      'frequency_interval': '1'
    }],
    'merchant_preferences': {
      'setup_fee': {'currency': 'USD', 'value': '25'},
      'max_fail_attempts': '1',
      'return_url': 'http://www.success.com',
      'cancel_url': 'http://www.cancel.com',
      'auto_bill_amount': 'YES',
      'initial_fail_amount_action': 'CONTINUE'
    },
    'create_time': '2014-07-10T13:40:10.407Z',
    'update_time': '2014-07-10T13:40:10.407Z',
    'links': [{
      'href': 'https://api.sandbox.paypal.com/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY',
      'rel': 'self',
      'method': 'GET'
    }]
  }, {
    server: 'Apache-Coyote/1.1',
    proxy_server_info: 'host=slcsbjava3.slc.paypal.com;threadId=298',
    'paypal-debug-id': '30395cb803536',
    server_info: 'paymentsplatformserv:v1.payments.billing-plans&CalThreadId=21897&TopLevelTxnStartTime=1472080b197&Host=slcsbjm3.slc.paypal.com&pid=24310',
    'content-language': '*',
    date: 'Thu, 10 Jul 2014 13:40:10 GMT',
    'content-type': 'application/json',
    'content-length': '1415'
  });

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY', [{
    'op': 'replace',
    'path': '/',
    'value': {'state': 'active'}
  }])
  .reply(200, '', {
    server: 'Apache-Coyote/1.1',
    proxy_server_info: 'host=slcsbjava2.slc.paypal.com;threadId=127',
    'paypal-debug-id': '92812b350cfa8',
    server_info: 'paymentsplatformserv:v1.payments.billing-plans&CalThreadId=22099&TopLevelTxnStartTime=1472080b691&Host=slcsbjm3.slc.paypal.com&pid=24310',
    'content-language': '*',
    date: 'Thu, 10 Jul 2014 13:40:12 GMT',
    'content-type': 'text/xml',
    'content-length': '0'
  });

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/random', [{
    'op': 'replace',
    'path': '/',
    'value': {'state': 'active'},
  }])
  .reply(404, '', {});

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/random', [{
    'op': 'replace',
    'path': '/',
    'value': {'name': 'Updated name'},
  }])
  .reply(404, '', {});

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY', [{
    'op': 'replace',
    'path': '/',
    'value': {'name': 'Updated name'},
  }])
  .reply(200, '', {});

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/random', [{
    'op': 'replace',
    'path': '/',
    'value': {'state': 'deleted'},
  }])
  .reply(404, '', {});

nock('https://api.sandbox.paypal.com')
  .patch('/v1/payments/billing-plans/P-12U98928TT9129128ECALAJY', [{
    'op': 'replace',
    'path': '/',
    'value': {'state': 'deleted'},
  }])
  .reply(200, '', {});

const mockAgreement = {
  'name': 'Fast Speed Agreement',
  'description': 'Agreement for Fast Speed Plan',
  'plan': {
    'id': 'P-12U98928TT9129128ECALAJY',
    'state': 'ACTIVE',
    'name': 'Testing1-Regular1',
    'description': 'Create Plan for Regular',
    'type': 'INFINITE',
    'payment_definitions': [{
      'id': 'PD-6NM64917YN7765425ECAMIPI',
      'name': 'Regular 1',
      'type': 'REGULAR',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '100'},
      'charge_models': [{
        'id': 'CHM-0KE608780B2534216ECAMIPI',
        'type': 'TAX',
        'amount': {'currency': 'USD', 'value': '20'}
      }, {'id': 'CHM-5LV43906LJ307104DECAMIPI', 'type': 'SHIPPING', 'amount': {'currency': 'USD', 'value': '10.6'}}],
      'cycles': '0',
      'frequency_interval': '1'
    }, {
      'id': 'PD-6C822850FP2569353ECAMIPI',
      'name': 'Trial 1',
      'type': 'TRIAL',
      'frequency': 'Month',
      'amount': {'currency': 'USD', 'value': '20'},
      'charge_models': [{
        'id': 'CHM-2B6251795H312091PECAMIPI',
        'type': 'TAX',
        'amount': {'currency': 'USD', 'value': '20'}
      }, {'id': 'CHM-7HY62822F8753893WECAMIPI', 'type': 'SHIPPING', 'amount': {'currency': 'USD', 'value': '10.6'}}],
      'cycles': '4',
      'frequency_interval': '1'
    }],
    'merchant_preferences': {
      'setup_fee': {'currency': 'USD', 'value': '25'},
      'max_fail_attempts': '1',
      'return_url': 'http://www.success.com',
      'cancel_url': 'http://www.cancel.com',
      'auto_bill_amount': 'YES',
      'initial_fail_amount_action': 'CONTINUE'
    },
  },
  'links': [{
    'href': 'https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=EC-28Y23504JA4250117',
    'rel': 'approval_url',
    'method': 'REDIRECT'
  }, {
    'href': 'https://api.sandbox.paypal.com/v1/payments/billing-agreements/EC-28Y23504JA4250117/agreement-execute',
    'rel': 'execute',
    'method': 'POST'
  }],
  'start_date': '2015-02-19T00:37:04Z'
};

nock('https://api.sandbox.paypal.com')
  .post('/v1/payments/billing-agreements/', {
    'name': 'Fast Speed Agreement',
    'description': 'Agreement for Fast Speed Plan',
    'start_date': '2015-02-19T00:37:04Z',
    'plan': {'id': 'P-12U98928TT9129128ECALAJY'},
    'payer': {'payment_method': 'paypal'},
    'shipping_address': {
      'line1': 'StayBr111idge Suites',
      'line2': 'Cro12ok Street',
      'city': 'San Jose',
      'state': 'CA',
      'postal_code': '95112',
      'country_code': 'US',
    },
  })
  .reply(201, mockAgreement, {});

nock('https://api.sandbox.paypal.com')
  .post('/v1/payments/billing-agreements/random token/agreement-execute')
  .reply(404, '', {});

nock('https://api.sandbox.paypal.com')
  .post('/v1/payments/billing-agreements/EC-28Y23504JA4250117-UNAPPROVED/agreement-execute')
  .reply(402, '', {});

nock('https://api.sandbox.paypal.com')
  .post('/v1/payments/billing-agreements/EC-28Y23504JA4250117/agreement-execute')
  .reply(200, { 'id': 'I-0LN988D3JACS' }, {});

nock('https://api.sandbox.paypal.com')
  .get('/v1/payments/billing-agreements/I-0LN988D3JACS')
  .reply(200, mockAgreement, {});
