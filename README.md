# Microservice for handling PayPal payments over AMQP transport layer

## Plans

### Plans workflow

Plan is a PayPal object first, then database object stored on our side. Keep that in mind all the time.

PayPal follows specific schema for plan description which describes how subscriber would be charged.

On our side we need to attach additional data: if plan is available to subscribe and subscription options.

After plan has been created it becomes available for users to subscribe.

### Create plan

To create a plan you need to provide certain data for create endpoint.

```JSON
{
  "hidden": <true|false>, // use true to make plan invisible to normal users
  "alias": <string>, // use this to set up plan alias (for your convenience)
  "subscriptions": [<subscription>], // this is most important part: links our metadata with plan charging models
  "plan": <plan> // charging models for plan, this must be strictly as paypal wants (see it's documentation or plan.json)
}
```

Now onto subscriptions.

```JSON
{
  "models": <number>, // number of models added on each billing cycle (month or year)
  "price": <number>, // price of additional models (for 1 model)
  "name": <string> // name of subscription, see below
}
```

Subscription name **must be exactly the same** as plan payment definition name.

As for plan, you must specify "name", "description", "type", "payment_definitions" and "merchant_preferences" only.

```JSON
{
  "name": <string>, // plan name, could be anything
  "description": <string>, // plan description, ditto
  "type": "infinite", // paypal provides 2 options, use infinite only
  "payment_definitions": [<definition>], // most important part, defines charging models
  "merchant_preferences": [<preference>] // additional data, not really important
}
```

Payment definitions are simple and as with subscriptions you need to provide only 2 of them: monthly and annual.

```JSON
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

```JSON
{
  "type": <tax|shipping>, // self-descriptive
  "amount": {
    "currency": "USD", // can be any ISO 4217 code you want
    "value": "10.0", // string! any valid ISO 4217 amount
  }
}
```
