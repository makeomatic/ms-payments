# Microservice for handling PayPal / Stripe payments over AMQP transport layer

[![Build Status](https://semaphoreci.com/api/v1/makeomatic/ms-payments/branches/master/shields_badge.svg)](https://semaphoreci.com/makeomatic/ms-payments)
[![Code Climate](https://codeclimate.com/github/makeomatic/ms-payments/badges/gpa.svg)](https://codeclimate.com/github/makeomatic/ms-payments)
[![npm version](https://badge.fury.io/js/ms-payments.svg)](https://badge.fury.io/js/ms-payments)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![codecov.io](https://codecov.io/github/makeomatic/ms-payments/coverage.svg?branch=master)](https://codecov.io/github/makeomatic/ms-payments?branch=master)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fmakeomatic%2Fms-payments.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fmakeomatic%2Fms-payments?ref=badge_shield)

## API Documentation

Please follow [this link](https://makeomatic.github.io/ms-payments/docs/API.html).

## Tests

Before running tests, you should create your "/test/.env" file with stripe private and public keys.  
Details are in ["./test/.env.example"](./test/.env.example).

## Plans

### Plans workflow

Plan is a PayPal object first, then database object stored on our side. Keep that in mind all the time.

PayPal follows specific schema for plan description which describes how subscriber would be charged.

On our side we need to attach additional data: if plan is available to subscribe and subscription options.

After plan has been created it becomes available for users to subscribe.

### Create plan

To create a plan you need to provide certain data for create endpoint.

```
{
  "hidden": <true|false>, // use true to make plan invisible to normal users
  "alias": <string>, // use this to set up plan alias (for your convenience)
  "title": <string>, // plan title that is going to be displayed to user
  "subscriptions": [<subscription>], // this is most important part: links our metadata with plan charging models
  "plan": <plan> // charging models for plan, this must be strictly as paypal wants (see it's documentation or plan.json)
}
```

Now onto subscriptions.

```
{
  "models": <number>, // number of models added on each billing cycle (month or year)
  "price": <number>, // price of additional models (for 1 model)
  "name": <string> // name of subscription, see below
}
```

Subscription name **must be exactly the same** as plan payment definition name.

As for plan, you must specify "name", "description", "type", "payment_definitions" and "merchant_preferences" only.

```
{
  "name": <string>, // plan name, could be anything
  "description": <string>, // plan description, ditto
  "type": "infinite", // paypal provides 2 options, use infinite only
  "payment_definitions": [<definition>], // most important part, defines charging models
  "merchant_preferences": [<preference>] // additional data, not really important
}
```

Payment definitions are simple and as with subscriptions you need to provide only 2 of them: monthly and annual.

```
{
  "name": <string>, // must be exactly the same as in subscription
  "type": "regular", // paypal provides option for trial plans too, but it's not implemented on our side
  "frequency_interval": "1", // string! how often to charge, you don't need to use anything more than 1
  "frequency": <month|year>, // paypal supports daily and weekly plans too, not implemented
  "cycles": "0", // must be "0" (string, not number)
  "amount": {
    "currency": "USD", // can be any ISO 4217 code you want
    "value": "10.0", // string! any valid ISO 4217 amount
  },
  "charge_models": [<charge>] // apply tax here
}
```

Charge model allows you to apply tax and shipping (not applicable for us).

```
{
  "type": <tax|shipping>, // self-descriptive
  "amount": {
    "currency": "USD", // can be any ISO 4217 code you want
    "value": "10.0", // string! any valid ISO 4217 amount
  }
}
```


## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fmakeomatic%2Fms-payments.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fmakeomatic%2Fms-payments?ref=badge_large)
