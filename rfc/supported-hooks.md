# Hooks
The current format of the supported hooks.

## Paypal

### Agreements execution
For now, you may never receive a hook if:
* An unexpected error has happen

#### Success

```json
{
  "meta": { "type": "paypal:agreements:execution:success" },
  "data": {
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.com",
      "status": "active",
      "token": "BA-5G371300PF745064S"  
    }
  }
}
```

#### Failure

##### Forbidden agreement status
```json
{
  "meta": { "type": "paypal:agreements:execution:failure" },
  "data": {
    "error": {
      "message": "Agreement execution failed. Reason: Paypal agreement \"I-VG69HM654BKF\" has status: \"cancelled\", not \"active\"",
      "code": "agreement-status-forbidden",
      "params": {
        "agreementId": "I-VG69HM654BKF",
        "status": "cancelled",
        "owner": "test@test.ru",
        "token": "BA-5G371300PF745064S"  
      }
    }
  }
}
```

##### Unknown subscription token
Agreement data not found in ms-payments database
```json
{
  "meta": { "type": "paypal:agreements:execution:failure" },
  "data": {
    "error": {
      "message": "Agreement execution failed. Reason: Unknown subscription token \"BA-5G371300PF745064S\"",
      "code": "unknown-subscription-token",
      "params": {
        "token": "BA-5G371300PF745064S"  
      }
    }
  }
}
```

##### Invalid subscription token
Paypal has not found token
```json
{
  "meta": { "type": "paypal:agreements:execution:failure" },
  "data": {
    "error": {
      "message": "Agreement execution failed. Reason: Paypal considers token \"BA-5G371300PF745064S\" as invalid",
      "code": "invalid-subscription-token",
      "params": {
        "token": "BA-5G371300PF745064S",
        "owner": "test@test.com"
      }
    }
  }
}
```

### Agreements billing
For now, you may never receive a hook if:
* An unexpected error has happen
* Agreement already has `active` status, but there are no outstanding transactions yet

#### Success

Cycles billed could be 0:

```json
{
  "meta": { "type": "paypal:agreements:billing:success" },
  "data": {
    "cyclesBilled": 0,
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.com",
      "status": "active"
    }
  }
}
```

As well as 1:
```json
{
  "meta": { "type": "paypal:agreements:billing:success" },
  "data": {
    "cyclesBilled": 1,
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.com",
      "status": "active"
    }
  }
}
```

#### Failure

##### Forbidden agreement status
This error is retryable.
Failure due to invalid agreement status, could be `cancelled` or `suspended`:
```json
{
  "meta": { "type": "paypal:agreements:billing:failure" },
  "data": {
    "error": {
      "code": "agreement-status-forbidden",
      "params": { "status": "cancelled", "agreementId": "I-21LTDJU14P4U", "owner": "test@test.ru" },
      "message": "Agreement billing failed. Reason: Agreement \"I-21LTDJU14P4U\" has status \"cancelled\""
    }
  }
}
```

##### Incriased failed payment count.
This error is retryable.
Failure due to increased `failed_payment_count` on Agreement. Generally, this happens when PayPal was unable to bill the next billing cycle and will retry later.
```json
{
  "meta": { "type": "paypal:agreements:billing:failure" },
  "data": {
    "error": {
      "code": "agreement-payment-failed",
      "params": {
        "agreementId": "I-21LTDJU14P4U",
        "owner": "test@test.ru",
        "failedCount": {
          "local": 1,
          "remote": 2,
        },
      },
      "message": "Agreement billing failed. Reason: Agreement \"I-21LTDJU14P4U\" as increased failed payment count"
    }
  }
}
```
