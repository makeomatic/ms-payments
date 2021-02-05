# Hooks
The current format of the supported hooks.

## Paypal
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
