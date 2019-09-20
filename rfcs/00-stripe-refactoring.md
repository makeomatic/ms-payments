# Stripe refactoring

Date: 9/1/2019

## Task

Save user's card for future payments using `Stripe API`. Refactor or remove existing methods.

## Techdoc

### Remove

All unused stripe things must be removed (use `git` for recover it)

### List of missing endpoints

#### List of payment methods

`GET /payment-methods/list`

Return a list of payment methods. Stripe the only one payment method now. Availability depends on config (e.g. `config.stripe.enabled = true/false`).

###### Auth

Required

###### Params

No

###### Response

```json
{
  "data": [
    {
      "type": "payment-method-stripe-card",
      "id": "<internal-uuid>"
      "attributes": {
        "cardBrand": "visa",
        "cardLast4": "7771",
      }
    }
  ]
}
```

#### Set default payment method

`POST /payment-methods/set-default`

Set default payment method. Stripe the only one payment method now.

###### Auth

Required

###### Params
`JSON` body

Name | Description
--- | ---
`id` | internal payment method id
`type` | type of payment method (`payment-method-stripe`)

###### Response

No

#### Save card using Stripe API

There are three endpoints here.

##### Setup intent

`POST /stripe/setup-intent`

1. Resolve internal customer id from user's metadata
  1. If internal customer id doesn't exist
    1. Create customer using stripe API
    2. Generate internal customer id (uuid v4)
    3. Save customer to redis
    4. Set internal customer id to user's metadata
2. Retrieve internal customer from redis
3. Create intents using stripe API
4. Return client_secret

- [Create a SetupIntent on the server](https://stripe.com/docs/payments/cards/saving-cards-without-payment#create-setup-intent)
- [Create a SetupIntent API](https://stripe.com/docs/api/setup_intents/create)

###### Auth

Required

###### Params

No

###### Response

```json
{
  "data": {
    "type": "stripe-payment-intent",
    "id": "<random-uuid>",
    "attributes": {
      "clientSecret": "<client-secret>"
    }
  }
}
```

##### Save card

`POST /stripe/attach-payment-methods`

1. Resolve internal customer id from user's metadata
2. Retrieve internal customer from redis
3. Attach payment method using Stripe API
4. Save payment method to redis
5. Resolve default payment method from user's metadata
5. If `useAsDefault === true` or default payment method is not set, save payment method as default to user's metadata
6. Return payment method object

###### Auth

Required

###### Params
`JSON` body

Name | Required | Default | Description
--- | --- | --- | ---
`paymentMethod` | yes |  | `intent.payment_method` from `stripe.js`
`useAsDefault` | no | true | Use this payment method as default, if default payment is not set, forced true

###### Response

```json
{
  "data": {
    "type": "payment-method-stripe-card",
    "id": "<internal-uuid>"
    "attributes": {
      "cardBrand": "visa",
      "cardLast4": "7771",
    }
  }
}
```

##### Remove card

`POST /stripe/remove-card`

Remove payment method from stripe

###### Auth

Required

###### Params
`JSON` body

Name | Required | Default | Description
--- | --- | --- | ---
`id` | | | internal payment method id

###### Response

No
