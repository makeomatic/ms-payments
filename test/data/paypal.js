module.exports.billingPlanAttributes = {
  'description': 'Create Plan for Regular',
  'merchant_preferences': {
    'auto_bill_amount': 'yes',
    'cancel_url': 'http://www.cancel.com',
    'initial_fail_amount_action': 'continue',
    'max_fail_attempts': '1',
    'return_url': 'http://www.success.com',
    'setup_fee': {
      'currency': 'USD',
      'value': '25',
    },
  },
  'name': 'Testing1-Regular1',
  'payment_definitions': [
    {
      'amount': {
        'currency': 'USD',
        'value': '100',
      },
      'charge_models': [
        {
          'amount': {
            'currency': 'USD',
            'value': '10.60',
          },
          'type': 'SHIPPING',
        },
        {
          'amount': {
            'currency': 'USD',
            'value': '20',
          },
          'type': 'TAX',
        },
      ],
      'cycles': '0',
      'frequency': 'MONTH',
      'frequency_interval': '1',
      'name': 'Regular 1',
      'type': 'regular',
    },
    {
      'amount': {
        'currency': 'USD',
        'value': '20',
      },
      'charge_models': [
        {
          'amount': {
            'currency': 'USD',
            'value': '10.60',
          },
          'type': 'SHIPPING',
        },
        {
          'amount': {
            'currency': 'USD',
            'value': '20',
          },
          'type': 'TAX',
        },
      ],
      'cycles': '4',
      'frequency': 'MONTH',
      'frequency_interval': '1',
      'name': 'Trial 1',
      'type': 'trial',
    },
  ],
  'type': 'infinite',
};

module.exports.billingAgreementAttributes = {
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
};
