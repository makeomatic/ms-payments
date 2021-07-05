# Hooks
The current format of the supported hooks.

## Paypal

### Agreements execution
For now, you may never receive a hook if:
* An unexpected error has happen
* Hooks `paypal:agreements:execution` and `paypal:agreements:finalization` use same data structure

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

```json
{
  "meta": { "type": "paypal:agreements:finalization:success" },
  "data": {
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.com",
      "status": "active",
      "token": "BA-5G371300PF745064S"  
    },
    "creatorTaskId": 'uuid',
    "transactionRequired": true/false,
    "agreementFinalized": true,
    "transaction": {
      // Paypal Transaction
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

```json
{
  "meta": { "type": "paypal:agreements:finalization:failure" },
  "data": {
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.com",
      "status": "active",
      "token": "BA-5G371300PF745064S"  
    },
    "creatorTaskId": 'uuid',
    "transactionRequired": true/false,
    "agreementFinalized": false,
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

`Agreement.bill` will execute hooks:

1. `billing:failure` hook when `agreement_details.failed_payment_count` increased and `agreement_details.cycles_complete` not increased. This condition means that PayPal will retry in a log future.
2. `billing:success` hook:
    * With `cyclesBilled === 0`, the receiver should retry the billing request in a while and wait for agreement_details.complete_cycles to increase. This condition means that PayPal didn't billed cycle.
    * With `cyclesBilled > 0`, generally means that everything billed successfully.

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

##### Increased failed payment count.
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
