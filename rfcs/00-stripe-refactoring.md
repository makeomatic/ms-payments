# Stripe refactoring

Date: 9/1/2019

## Task

Save user's card for future payments using `Stripe API`. Refactor or remove existing methods.

## Techdoc

### Remove

All unused stripe things must be removed (use `git` for recover it)

### List of missing endpoints

#### Get a list of stripe payment methods

`GET /stripe/payment-methods/list`

Return a list of stripe payment methods.

###### Auth

Required

###### Params

No

###### Response

```json
{
  "meta": {
    "defaultPaymentMethodId": "<internal-uuid>"
  },
  "data": [
    {
      "type": "payment-method-stripe-card",
      "id": "<internal-uuid>",
      "attributes": {
        "cardBrand": "visa",
        "cardLast4": "7771"
      }
    }
  ]
}
```

#### Set a default payment method for stripe

`POST /stripe/payment-methods/set-default`

Set a default payment method for stripe.

###### Auth

Required

###### Params
`JSON` body

Name | Required | Default | Description
--- | --- | --- | ---
`id` | yes | | internal payment method id

###### Response

```json
{
  "meta": {
    "updated": true,
    "id": "<internal-uuid>"
  }
}
```

#### Setup intent

`POST /stripe/setup-intents/create`

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

##### Auth

Required

##### Params

No

##### Response

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

#### Save card

`POST /stripe/payment-methods/attach`

Attach payment method to user

1. Resolve internal customer id from user's metadata
2. Retrieve internal customer from redis
3. Attach payment method using Stripe API
4. Save payment method to redis
5. Resolve default payment method from user's metadata
5. If `useAsDefault === true` or default payment method is not set, save payment method as default to user's metadata
6. Return payment method object

##### Auth

Required

##### Params
`JSON` body

Name | Required | Default | Description
--- | --- | --- | ---
`paymentMethod` | yes |  | `intent.payment_method` from `stripe.js`
`useAsDefault` | no | true | Use this payment method as default, if default payment is not set, forced true

##### Response

```json
{
  "data": {
    "type": "payment-method-stripe-card",
    "id": "<internal-uuid>",
    "attributes": {
      "cardBrand": "visa",
      "cardLast4": "7771"
    }
  }
}
```

#### Remove payment method
`POST /stripe/payment-methods/delete`

Remove payment method from user

1. Remove payment method from redis
2. Detach payment method using stripe API
3. If it's default payment method set any other as default

##### Auth
Required

##### Params
`JSON` body

Name | Required | Default | Description
--- | --- | --- | ---
`id` | yes | | internal payment method id

###### Response

```json
{
  "meta": {
    "deleted": true,
    "id": "<internal-uuid>",
    "defaultPaymentMethodId": "<internal-uuid>"
  }
}
```
