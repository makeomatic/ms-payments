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
      "type": "payment-method-stripe",
      "id": "<internal-uuid>"
      "attributes": {
        // @TODO
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

1. Create setup intent
2. Return client secret

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
    "type": "stripe-setup-intent",
    "id": "<random-uuid>",
    "attributes": {
      "clientSecret": "<client-secret>"
    }
  }
}
```

##### Save card

`POST /stripe/save-card`

1. Create local customer if not exists
2. Create stripe customer if not exists or attach `intent.payment_method` to stripe customer
3. Save payment method to local db
4. Return payment method object

###### Auth

Required

###### Params
`JSON` body

Name | Description
--- | ---
`intent` | intent object from stripe
`useAsDefault` | use this payment method as default

###### Response

```json
{
  "data": [
    {
      "type": "payment-method-stripe",
      "id": "<internal-uuid>"
      "attributes": {
        // @TODO
      }
    }
  ]
}
```

##### Remove card

`POST /stripe/remove-card`

Remove payment method from stripe

###### Auth

Required

###### Params
`JSON` body

Name | Description
--- | ---
`id` | internal payment method id

###### Response

No
