# Hooks
The current format of the supported hooks.

## Paypal

### Agreements execution
For now, you may never receive a hook if:
* An unexpected error has happen
* Subscription token was not found in ms-payments database (should not happen if you do everything right)

#### Success

```json
{
  "meta": { "type": "paypal:agreements:execution:success" },
  "data": {
    "id": "I-21LTDJU14P4U",
    "owner": "test@test.com",
    "status": "active"
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
      "message": "Paypal agreement in state: \"cancelled\", not \"active\"",
      "code": "agreement-status-forbidden",
      "params": {
        "status": "cancelled"  
      }
    }
  }
}
```

##### Unknown subscription token
```json
{
  "meta": { "type": "paypal:agreements:execution:failure" },
  "data": {
    "error": {
      "message": "Unknown subscription token \"BA-5G371300PF745064S\"",
      "code": "agreement-status-forbidden",
      "params": {
        "token": "BA-5G371300PF745064S"  
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
    "agreement": {
      "id": "I-21LTDJU14P4U",
      "owner": "test@test.ru",
      "status": "cancelled"
    },
    "error": {
      "code": "agreement-status-forbidden",
      "params": { "status": "cancelled" },
      "message": "Billing not permitted. Reason: Forbidden agreement status \"cancelled\"",
    }
  }
}
```
