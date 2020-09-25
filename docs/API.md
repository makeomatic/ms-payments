<a name="top"></a>
# Service ms-payments v8.5.0

Core of the microservice for handling payments

- [Agreement](#Agreement)
	- [Bill agreement](#Bill-agreement)
	- [Change agreement state](#Change-agreement-state)
	- [Create agreement](#Create-agreement)
	- [Executes agreement for approval](#Executes-agreement-for-approval)
	- [Get Agreement](#Get-Agreement)
	- [Get agreement for user](#Get-agreement-for-user)
	- [List Agreements](#List-Agreements)
	- [Sync agreements](#Sync-agreements)
	
- [Balance](#Balance)
	- [Decrement balance](#Decrement-balance)
	- [Get balance](#Get-balance)
	
- [Charge](#Charge)
	- [Get charge](#Get-charge)
	- [List charges](#List-charges)
	
- [Charge.Paypal](#Charge.Paypal)
	- [Paypal - Capture paypal funds](#Paypal---Capture-paypal-funds)
	- [Paypal - Create Paypal charge](#Paypal---Create-Paypal-charge)
	- [Paypal - Return Paypal funds](#Paypal---Return-Paypal-funds)
	- [Paypal - Void paypal charge](#Paypal---Void-paypal-charge)
	
- [Charge.Stripe](#Charge.Stripe)
	- [Stripe - Create charge](#Stripe---Create-charge)
	- [Stripe - Webhook handler](#Stripe---Webhook-handler)
	
- [Plan](#Plan)
	- [Change plan state](#Change-plan-state)
	- [Create plan](#Create-plan)
	- [Delete plan](#Delete-plan)
	- [Get Plan](#Get-Plan)
	- [List plans](#List-plans)
	- [Update plan](#Update-plan)
	
- [Sale](#Sale)
	- [Create sale](#Create-sale)
	- [Execute sale](#Execute-sale)
	- [Get sale](#Get-sale)
	- [List sales](#List-sales)
	- [Sync sale](#Sync-sale)
	
- [Transaction](#Transaction)
	- [Aggregate transaction](#Aggregate-transaction)
	- [Common transaction data](#Common-transaction-data)
	- [Get transaction](#Get-transaction)
	- [List transactions](#List-transactions)
	- [Sync transactions](#Sync-transactions)
	- [Sync Updated transactions](#Sync-Updated-transactions)
	
- [zSchemaDefinitions](#zSchemaDefinitions)
	- [[common] Agreement object](#[common]-Agreement-object)
	- [[common] Definitions](#[common]-Definitions)
	- [[common] Extra `DataTypes`](#[common]-Extra-`DataTypes`)
	- [[common] Payment plan object](#[common]-Payment-plan-object)
	- [[common] Subscription object](#[common]-Subscription-object)
	- [[response.common] Agreement object](#[response.common]-Agreement-object)
	- [[response.common] Definitions](#[response.common]-Definitions)
	- [[response.common] Payment plan object](#[response.common]-Payment-plan-object)
	- [[response.common] Sale object](#[response.common]-Sale-object)
	- [[response.common] Subscription object](#[response.common]-Subscription-object)
	- [[response.common] Transaction common information object](#[response.common]-Transaction-common-information-object)
	- [[response.common] Transaction information object](#[response.common]-Transaction-information-object)
	- [[response.common] Transaction object](#[response.common]-Transaction-object)
	


# <a name='Agreement'></a> Agreement
## <a name='Bill-agreement'></a> Bill agreement
<p>Bills requested agreement</p>

Source: [src/actions/agreement/bill.js](src/actions/agreement/bill.js).
```
AMQP,INTERNAL agreement.bill
```


### Request schema

<a name="agreement.bill--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **agreement**
    <a name="agreement.bill--/properties/agreement"/>`{string}`<br>
 - **nextCycle**
    <a name="agreement.bill--/properties/nextCycle"/>`{integer}`<br>
 - **username**
    <a name="agreement.bill--/properties/username"/>`{string}`<br>


### Response schema:

<a name="response.agreement.bill--"/>`{string}`<br>

String as status of the operation





**[⬆ Back to Top](#top)**
## <a name='Change-agreement-state'></a> Change agreement state
<p>Change currently used agreement for {owner} to {state}</p>

Source: [src/actions/agreement/state.js](src/actions/agreement/state.js).
```
AMQP <prefix>.agreement.state
```


### Request schema

<a name="agreement.state--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["owner","state"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **state**
    <a name="agreement.state--/properties/state"/>`{string}`<br>
    Constraints: `enum`: `["suspend","reactivate","cancel"]`<br>
 - **note**
    <a name="agreement.state--/properties/note"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>


### Response schema:

<a name="response.agreement.state--"/>`{string}`<br>
Constraints: `enum`: `["suspend","reactivate","cancel"]`<br>




**[⬆ Back to Top](#top)**
## <a name='Create-agreement'></a> Create agreement
<p>Creates agreement for approval through paypal and sends link back</p>

Source: [src/actions/agreement/create.js](src/actions/agreement/create.js).
```
AMQP <prefix>.agreement.create
```


### Request schema

<a name="agreement.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["owner","agreement"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **agreement**
    *Could be allOf:*
    
     - [[common] Agreement object(agreement#)](#agreement--)
     - <a name="agreement.create--/properties/agreement/allOf/1"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **plan**
            <a name="agreement.create--/properties/agreement/allOf/1/properties/plan"/>`{object}`<br>
            Additional properties allowed: `false`<br>
            Constraints: `required`: `["id"]`<br>
            Properties:
            
             - **id**
                <a name="agreement.create--/properties/agreement/allOf/1/properties/plan/properties/id"/>`{string}`<br>
                Constraints: `pattern`: `"^P-[A-Z0-9]+$"`<br>
            
        
    
 - **trialDiscount**
    <a name="agreement.create--/properties/trialDiscount"/>`{integer}`<br>
    Constraints: `minimum`: `0`, `maximum`: `100`<br>
 - **trialCycle**
    <a name="agreement.create--/properties/trialCycle"/>`{integer}`<br>
    Constraints: `minimum`: `1`<br>
    Default: `12`


### Response schema:

<a name="response.agreement.create--"/>`{object}`<br>
Additional properties allowed: `true`<br>

Created agreement

Properties:

 - **token**
    <a name="response.agreement.create--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **url**
    <a name="response.agreement.create--/properties/url"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **agreement**
    [[response.common] Agreement object(response.common.agreement#)](#response.common.agreement--)





**[⬆ Back to Top](#top)**
## <a name='Executes-agreement-for-approval'></a> Executes agreement for approval
<p>Performs agreement approval through paypal and sends link back</p>

Source: [src/actions/agreement/execute.js](src/actions/agreement/execute.js).
```
AMQP <prefix>.agreement.execute
```


### Request schema

<a name="agreement.execute--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["token"]`<br>
Properties:

 - **token**
    <a name="agreement.execute--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>


### Response schema:

<a name="response.agreement.execute--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **t**
    <a name="response.agreement.execute--/properties/t"/>`{integer}`<br>
 - **httpStatusCode**
    <a name="response.agreement.execute--/properties/httpStatusCode"/>`{integer}`<br>
 - **id**
    <a name="response.agreement.execute--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **state**
    <a name="response.agreement.execute--/properties/state"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.agreement.execute--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.agreement.execute--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **start_date**
    <a name="response.agreement.execute--/properties/start_date"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **agreement_details**
    [Agreement details(common#/definitions/agreement_details)](#common--/definitions/agreement_details)
 - **payer**
    [Payer information(common#/definitions/payer)](#common--/definitions/payer)
 - **shipping_address**
    [Address(common#/definitions/address)](#common--/definitions/address)
 - **override_merchant_preferences**
    [Merchant preferences(common#/definitions/merchant_preferences)](#common--/definitions/merchant_preferences)
 - **override_charge_models**
    <a name="response.agreement.execute--/properties/override_charge_models"/>`{array}`<br>
    Each item should be:
    [Override charge model(common#/definitions/override_charge_model)](#common--/definitions/override_charge_model)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **create_time**
    <a name="response.agreement.execute--/properties/create_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **update_time**
    <a name="response.agreement.execute--/properties/update_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **links**
    <a name="response.agreement.execute--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)





**[⬆ Back to Top](#top)**
## <a name='Get-Agreement'></a> Get Agreement
<p>Returns agreement information</p>

Source: [src/actions/agreement/get.js](src/actions/agreement/get.js).
```
AMQP <prefix>.agreement.get
```


### Request schema

<a name="agreement.get--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["id"]`<br>
Properties:

 - **id**
    <a name="agreement.get--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.agreement.get--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **id**
    <a name="response.agreement.get--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `4`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **state**
    <a name="response.agreement.get--/properties/state"/>`{string}`<br>
    
    The state of the agreement
    
 - **token**
    <a name="response.agreement.get--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `10`<br>
 - **plan**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **agreement**
    [[response.common] Agreement object(response.common.agreement#)](#response.common.agreement--)





**[⬆ Back to Top](#top)**
## <a name='Get-agreement-for-user'></a> Get agreement for user
<p>Retrieves agreement information for user</p>

Source: [src/actions/agreement/forUser.js](src/actions/agreement/forUser.js).
```
AMQP <prefix>.agreement.forUser
```


### Request schema

<a name="agreement.forUser--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["user"]`<br>
Properties:

 - **user**
    <a name="agreement.forUser--/properties/user"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>


### Response schema:

<a name="response.agreement.forUser--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **id**
    <a name="response.agreement.forUser--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `4`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **state**
    <a name="response.agreement.forUser--/properties/state"/>`{string}`<br>
    
    The state of the agreement
    
 - **token**
    <a name="response.agreement.forUser--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `10`<br>
 - **plan**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **agreement**
    [[response.common] Agreement object(response.common.agreement#)](#response.common.agreement--)





**[⬆ Back to Top](#top)**
## <a name='List-Agreements'></a> List Agreements
<p>Returns list of the agreements</p>

Source: [src/actions/agreement/list.js](src/actions/agreement/list.js).
```
AMQP <prefix>.agreement.list
```


### Request schema

<a name="agreement.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **offset**
    <a name="agreement.list--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>
 - **limit**
    <a name="agreement.list--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **criteria**
    <a name="agreement.list--/properties/criteria"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **order**
    <a name="agreement.list--/properties/order"/>`{string}`<br>
    Constraints: `enum`: `["ASC","DESC"]`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.agreement.list--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["items","cursor","page","pages"]`<br>
Properties:

 - **items**
    <a name="response.agreement.list--/properties/items"/>`{array}`<br>
    Each item should be:
    [`agreement.get` action response(response.agreement.get#)](#response.agreement.get--)
 - **cursor**
    <a name="response.agreement.list--/properties/cursor"/>`{number}`<br>
 - **page**
    <a name="response.agreement.list--/properties/page"/>`{number}`<br>
 - **pages**
    <a name="response.agreement.list--/properties/pages"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Sync-agreements'></a> Sync agreements
<p>Performs agreements synchronization</p>

Source: [src/actions/agreement/sync.js](src/actions/agreement/sync.js).
```
AMQP <prefix>.agreement.sync
```


### Request schema

<a name="agreement.sync--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **start**
    <a name="agreement.sync--/properties/start"/>`{integer}`<br>
 - **cursor**
    <a name="agreement.sync--/properties/cursor"/>`{integer}`<br>





**[⬆ Back to Top](#top)**
# <a name='Balance'></a> Balance
## <a name='Decrement-balance'></a> Decrement balance
Source: [src/actions/balance/decrement.js](src/actions/balance/decrement.js).
```
AMQP <prefix>.balance.decrement
```


### Request schema

<a name="balance.decrement--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["ownerId","amount","idempotency","goal"]`<br>
Properties:

 - **ownerId**
    <a name="balance.decrement--/properties/ownerId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
 - **amount**
    <a name="balance.decrement--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `1000000`<br>
    
    A positive integer representing how much to charge
    
 - **idempotency**
    <a name="balance.decrement--/properties/idempotency"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
    
    An idempotency key
    
 - **goal**
    <a name="balance.decrement--/properties/goal"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>


### Response schema:

<a name="response.balance.decrement--"/>`{number}`<br>




**[⬆ Back to Top](#top)**
## <a name='Get-balance'></a> Get balance
Source: [src/actions/balance/get.js](src/actions/balance/get.js).
```
GET <prefix>.balance.get
```


### Request schema

<a name="balance.decrement--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["ownerId","amount","idempotency","goal"]`<br>
Properties:

 - **ownerId**
    <a name="balance.decrement--/properties/ownerId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
 - **amount**
    <a name="balance.decrement--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `1000000`<br>
    
    A positive integer representing how much to charge
    
 - **idempotency**
    <a name="balance.decrement--/properties/idempotency"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
    
    An idempotency key
    
 - **goal**
    <a name="balance.decrement--/properties/goal"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>


### Response schema:

<a name="response.balance.decrement--"/>`{number}`<br>




**[⬆ Back to Top](#top)**
# <a name='Charge'></a> Charge
## <a name='Get-charge'></a> Get charge
<p>Get the charge information</p>

Source: [src/actions/charge/get.js](src/actions/charge/get.js).
```
HTTP-GET <prefix>.charge.get
```


### Request schema

<a name="charge.get--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["id"]`<br>
Properties:

 - **id**
    [Charge id(common#/definitions/chargeId)](#common--/definitions/chargeId)


### Response schema:

<a name="response.charge.get--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.get--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **amount**
        <a name="response.charge.get--/properties/data/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.get--/properties/data/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.get--/properties/data/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.get--/properties/data/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.get--/properties/data/properties/failReason"/>`{string}`<br>
    





**[⬆ Back to Top](#top)**
## <a name='List-charges'></a> List charges
<p>Get the list of charges</p>

Source: [src/actions/charge/list.js](src/actions/charge/list.js).
```
HTTP-GET <prefix>.charge.list
```


### Request schema

<a name="charge.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["limit","offset"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **limit**
    <a name="charge.list--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
    Default: `20`
 - **offset**
    <a name="charge.list--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>


### Response schema:

<a name="response.charge.list--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.list--/properties/data"/>`{array}`<br>
    
    Charges list
    
    Each item should be:
    <a name="response.charge.list--/properties/data/items"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **amount**
        <a name="response.charge.list--/properties/data/items/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.list--/properties/data/items/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.list--/properties/data/items/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.list--/properties/data/items/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.list--/properties/data/items/properties/failReason"/>`{string}`<br>
    
 - **meta**
    <a name="response.charge.list--/properties/meta"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **offset**
        <a name="response.charge.list--/properties/meta/properties/offset"/>`{number}`<br>
     - **limit**
        <a name="response.charge.list--/properties/meta/properties/limit"/>`{number}`<br>
     - **cursor**
        <a name="response.charge.list--/properties/meta/properties/cursor"/>`{number}`<br>
     - **page**
        <a name="response.charge.list--/properties/meta/properties/page"/>`{number}`<br>
     - **pages**
        <a name="response.charge.list--/properties/meta/properties/pages"/>`{number}`<br>
    





**[⬆ Back to Top](#top)**
# <a name='Charge.Paypal'></a> Charge.Paypal
## <a name='Paypal---Capture-paypal-funds'></a> Paypal - Capture paypal funds
<p>Captures requested <code>charge</code></p>

Source: [src/actions/charge/paypal/capture.js](src/actions/charge/paypal/capture.js).
```
AMQP <prefix>.charge.paypal.capture
```


### Request schema

<a name="charge.paypal.capture--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["paymentId"]`<br>
Properties:

 - **paymentId**
    <a name="charge.paypal.capture--/properties/paymentId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `1024`<br>


### Response schema:

<a name="response.charge.paypal.capture--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.paypal.capture--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Charge info
    
    Properties:
    
     - **amount**
        <a name="response.charge.paypal.capture--/properties/data/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.paypal.capture--/properties/data/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.paypal.capture--/properties/data/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.paypal.capture--/properties/data/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.paypal.capture--/properties/data/properties/failReason"/>`{string}`<br>
    





**[⬆ Back to Top](#top)**
## <a name='Paypal---Create-Paypal-charge'></a> Paypal - Create Paypal charge
Source: [src/actions/charge/paypal/create.js](src/actions/charge/paypal/create.js).
```
HTTP-POST <prefix>.charge.paypal.create
```


### Request schema

<a name="charge.paypal.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["amount","description","returnUrl","cancelUrl"]`<br>
Properties:

 - **amount**
    <a name="charge.paypal.create--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `1000000`<br>
    
    A positive integer representing how much to charge
    
 - **description**
    <a name="charge.paypal.create--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
    
    An arbitrary string which you can attach to a charge object
    
 - **returnUrl**
    <a name="charge.paypal.create--/properties/returnUrl"/>`{string}`<br>
    Constraints: `format`: `"uri"`<br>
 - **cancelUrl**
    <a name="charge.paypal.create--/properties/cancelUrl"/>`{string}`<br>
    Constraints: `format`: `"uri"`<br>


### Response schema:

<a name="response.charge.paypal.create--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.paypal.create--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Charge information
    
    Properties:
    
     - **amount**
        <a name="response.charge.paypal.create--/properties/data/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.paypal.create--/properties/data/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.paypal.create--/properties/data/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.paypal.create--/properties/data/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.paypal.create--/properties/data/properties/failReason"/>`{string}`<br>
    
 - **meta**
    <a name="response.charge.paypal.create--/properties/meta"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **paypal**
        <a name="response.charge.paypal.create--/properties/meta/properties/paypal"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        
        Paypal charge metadata
        
        Properties:
        
         - **approvalUrl**
            [Payment system provided links(common#/definitions/links)](#common--/definitions/links)
         - **paymentId**
            [Payment id(common#/definitions/paymentId)](#common--/definitions/paymentId)
        
    





**[⬆ Back to Top](#top)**
## <a name='Paypal---Return-Paypal-funds'></a> Paypal - Return Paypal funds
<p>Returns funds</p>

Source: [src/actions/charge/paypal/return.js](src/actions/charge/paypal/return.js).
```
HTTP-GET <prefix>.charge.paypal.return
```


### Request schema

<a name="charge.paypal.return--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["PayerID","paymentId"]`<br>
Properties:

 - **PayerID**
    <a name="charge.paypal.return--/properties/PayerID"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `1024`<br>
 - **paymentId**
    <a name="charge.paypal.return--/properties/paymentId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `1024`<br>
 - **token**
    <a name="charge.paypal.return--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `1024`<br>
    
    Paypal token
    


### Response schema:

<a name="response.charge.paypal.return--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.paypal.return--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Charge information
    
    Properties:
    
     - **id**
        <a name="response.charge.paypal.return--/properties/data/properties/id"/>`{string}`<br>
        Constraints: `format`: `"uuid"`<br>
     - **type**
        <a name="response.charge.paypal.return--/properties/data/properties/type"/>`{string}`<br>
        Constraints: `const`: `"charge"`<br>
     - **attributes**
        <a name="response.charge.paypal.return--/properties/data/properties/attributes"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **amount**
            <a name="response.charge.paypal.return--/properties/data/properties/attributes/properties/amount"/>`{string}`<br>
         - **description**
            <a name="response.charge.paypal.return--/properties/data/properties/attributes/properties/description"/>`{string}`<br>
         - **status**
            <a name="response.charge.paypal.return--/properties/data/properties/attributes/properties/status"/>`{number}`<br>
         - **createAt**
            <a name="response.charge.paypal.return--/properties/data/properties/attributes/properties/createAt"/>`{string}`<br>
            Constraints: `format`: `"date-time"`<br>
         - **owner**
            [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
         - **failReason**
            <a name="response.charge.paypal.return--/properties/data/properties/attributes/properties/failReason"/>`{string}`<br>
        
    
 - **meta**
    <a name="response.charge.paypal.return--/properties/meta"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Paypal metadata
    
    Properties:
    
     - **paypal**
        <a name="response.charge.paypal.return--/properties/meta/properties/paypal"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **payer**
            [Payer information(common#/definitions/payer)](#common--/definitions/payer)
        
    





**[⬆ Back to Top](#top)**
## <a name='Paypal---Void-paypal-charge'></a> Paypal - Void paypal charge
<p>Invalidate <code>charge</code></p>

Source: [src/actions/charge/paypal/void.js](src/actions/charge/paypal/void.js).
```
AMQP <prefix>.charge.paypal.void
```


### Request schema

<a name="charge.paypal.void--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["paymentId"]`<br>
Properties:

 - **paymentId**
    <a name="charge.paypal.void--/properties/paymentId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `1024`<br>


### Response schema:

<a name="response.charge.paypal.void--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.paypal.void--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Paypal charge
    
    Properties:
    
     - **amount**
        <a name="response.charge.paypal.void--/properties/data/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.paypal.void--/properties/data/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.paypal.void--/properties/data/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.paypal.void--/properties/data/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.paypal.void--/properties/data/properties/failReason"/>`{string}`<br>
    





**[⬆ Back to Top](#top)**
# <a name='Charge.Stripe'></a> Charge.Stripe
## <a name='Stripe---Create-charge'></a> Stripe - Create charge
<p>Creates new Stripe charge</p>

Source: [src/actions/charge/stripe/create.js](src/actions/charge/stripe/create.js).
```
HTTP-POST <prefix>.charge.stripe.create
```


### Request schema

<a name="charge.stripe.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["amount","description"]`<br>
Properties:

 - **amount**
    <a name="charge.stripe.create--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `1000000`<br>
    
    A positive integer representing how much to charge
    
 - **description**
    <a name="charge.stripe.create--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
    
    An arbitrary string which you can attach to a charge object
    
 - **statementDescriptor**
    <a name="charge.stripe.create--/properties/statementDescriptor"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `22`<br>
    
    An arbitrary string to be displayed on your customer’s credit card statement
    
 - **saveCard**
    <a name="charge.stripe.create--/properties/saveCard"/>`{boolean}`<br>
    
    Save card for a future charges
    
 - **email**
    <a name="charge.stripe.create--/properties/email"/>`{string}`<br>
    Constraints: `format`: `"email"`<br>
 - **token**
    <a name="charge.stripe.create--/properties/token"/>`{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `65536`<br>
    
    Token from stripe Checkout API. Stored card will be used if token is empty
    
 - **metadata**
    <a name="charge.stripe.create--/properties/metadata"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Default:
    ```json
    {}
    ```
    
    
    Set of key-value pairs that you can attach to a charge object
    


### Response schema:

<a name="response.charge.stripe.create--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **data**
    <a name="response.charge.stripe.create--/properties/data"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Stripe charge
    
    Properties:
    
     - **amount**
        <a name="response.charge.stripe.create--/properties/data/properties/amount"/>`{number}`<br>
     - **description**
        <a name="response.charge.stripe.create--/properties/data/properties/description"/>`{string}`<br>
     - **status**
        <a name="response.charge.stripe.create--/properties/data/properties/status"/>`{number}`<br>
     - **createAt**
        <a name="response.charge.stripe.create--/properties/data/properties/createAt"/>`{string}`<br>
        Constraints: `format`: `"date"`<br>
     - **owner**
        [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
     - **failReason**
        <a name="response.charge.stripe.create--/properties/data/properties/failReason"/>`{string}`<br>
    





**[⬆ Back to Top](#top)**
## <a name='Stripe---Webhook-handler'></a> Stripe - Webhook handler
<p>Handles requests from Stripe</p>

Source: [src/actions/charge/stripe/webhook.js](src/actions/charge/stripe/webhook.js).
```
HTTP-POST <prefix>.charge.stripe.webhook
```


### Request schema

<a name="charge.stripe.webhook--"/>`{object}`<br>
Additional properties allowed: `true`<br>

### Response schema:

<a name="response.charge.stripe.webhook--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **received**
    <a name="response.charge.stripe.webhook--/properties/received"/>`{boolean}`<br>
    Constraints: `const`: `true`<br>





**[⬆ Back to Top](#top)**
# <a name='Plan'></a> Plan
## <a name='Change-plan-state'></a> Change plan state
<p>Changes plan state</p>

Source: [src/actions/plan/state.js](src/actions/plan/state.js).
```
AMQP, INTERNAL <prefix>.plan.state
```


### Request schema

<a name="plan.state--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["id","state"]`<br>
Properties:

 - **id**
    <a name="plan.state--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **state**
    <a name="plan.state--/properties/state"/>`{string}`<br>
    Constraints: `enum`: `["created","active","inactive","deleted"]`<br>


### Response schema:

<a name="response.plan.state--"/>`{array}`<br>
Each item should be:
`{string}`<br>




**[⬆ Back to Top](#top)**
## <a name='Create-plan'></a> Create plan
<p>Creates new plan</p>

Source: [src/actions/plan/create.js](src/actions/plan/create.js).
```
AMQP <prefix>.plan.create
```


### Request schema

<a name="plan.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["alias","title","hidden","subscriptions","plan"]`<br>
Properties:

 - **hidden**
    <a name="plan.create--/properties/hidden"/>`{boolean}`<br>
 - **alias**
    <a name="plan.create--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="plan.create--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subscriptions**
    <a name="plan.create--/properties/subscriptions"/>`{array}`<br>
    Each item should be:
    [[common] Subscription object(subscription#)](#subscription--)
 - **plan**
    [[common] Payment plan object(plan#)](#plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)


### Response schema:

<a name="response.plan.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **state**
    <a name="response.plan.create--/properties/state"/>`{string}`<br>
 - **alias**
    <a name="response.plan.create--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.plan.create--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="response.plan.create--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.plan.create--/properties/description"/>`{string}`<br>
 - **hidden**
    <a name="response.plan.create--/properties/hidden"/>`{boolean}`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subs**
    <a name="response.plan.create--/properties/subs"/>`{array}`<br>
    Each item should be:
    [[response.common] Subscription object(response.common.subscription#)](#response.common.subscription--)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)
 - **type**
    [(plan#/definitions/type)](#plan--/definitions/type)
 - **month**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)
 - **year**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)





**[⬆ Back to Top](#top)**
## <a name='Delete-plan'></a> Delete plan
<p>Deletes plan</p>

Source: [src/actions/plan/delete.js](src/actions/plan/delete.js).
```
AMQP <prefix>.plan.delete
```


### Request schema

<a name="plan.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["alias","title","hidden","subscriptions","plan"]`<br>
Properties:

 - **hidden**
    <a name="plan.create--/properties/hidden"/>`{boolean}`<br>
 - **alias**
    <a name="plan.create--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="plan.create--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subscriptions**
    <a name="plan.create--/properties/subscriptions"/>`{array}`<br>
    Each item should be:
    [[common] Subscription object(subscription#)](#subscription--)
 - **plan**
    [[common] Payment plan object(plan#)](#plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)


### Response schema:

<a name="response.plan.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **state**
    <a name="response.plan.create--/properties/state"/>`{string}`<br>
 - **alias**
    <a name="response.plan.create--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.plan.create--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="response.plan.create--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.plan.create--/properties/description"/>`{string}`<br>
 - **hidden**
    <a name="response.plan.create--/properties/hidden"/>`{boolean}`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subs**
    <a name="response.plan.create--/properties/subs"/>`{array}`<br>
    Each item should be:
    [[response.common] Subscription object(response.common.subscription#)](#response.common.subscription--)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)
 - **type**
    [(plan#/definitions/type)](#plan--/definitions/type)
 - **month**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)
 - **year**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)





**[⬆ Back to Top](#top)**
## <a name='Get-Plan'></a> Get Plan
<p>Retrieves plan or parent plan by its id.</p>

Source: [src/actions/plan/get.js](src/actions/plan/get.js).
```
AMQP, INTERNAL <prefix>.plan.get
```


### Request schema

*Could be anyOf:*

 - `{string}`<br>
    Constraints: `minLength`: `1`, `maxLength`: `100`<br>
 - `{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["id"]`<br>
    
    Plan object
    
    Properties:
    
     - **id**
        <a name="plan.get--/anyOf/1/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `100`<br>
     - **fetchParent**
        <a name="plan.get--/anyOf/1/properties/fetchParent"/>`{boolean}`<br>
    


### Response schema:

<a name="response.plan.get--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **state**
    <a name="response.plan.get--/properties/state"/>`{string}`<br>
 - **alias**
    <a name="response.plan.get--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.plan.get--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="response.plan.get--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.plan.get--/properties/description"/>`{string}`<br>
 - **hidden**
    <a name="response.plan.get--/properties/hidden"/>`{boolean}`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subs**
    <a name="response.plan.get--/properties/subs"/>`{array}`<br>
    Each item should be:
    [[response.common] Subscription object(response.common.subscription#)](#response.common.subscription--)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)
 - **type**
    [(plan#/definitions/type)](#plan--/definitions/type)
 - **month**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)
 - **year**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)





**[⬆ Back to Top](#top)**
## <a name='List-plans'></a> List plans
<p>Returns list of the plans</p>

Source: [src/actions/plan/list.js](src/actions/plan/list.js).
```
AMQP <prefix>.plan.list
```


### Request schema

<a name="plan.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **offset**
    <a name="plan.list--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>
 - **limit**
    <a name="plan.list--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **criteria**
    <a name="plan.list--/properties/criteria"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **order**
    <a name="plan.list--/properties/order"/>`{string}`<br>
    Constraints: `enum`: `["ASC","DESC"]`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.plan.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["items","cursor","page","pages"]`<br>
Properties:

 - **items**
    <a name="response.plan.list--/properties/items"/>`{array}`<br>
    Each item should be:
    [Plan information(response.plan.get#)](#response.plan.get--)
 - **cursor**
    <a name="response.plan.list--/properties/cursor"/>`{number}`<br>
 - **page**
    <a name="response.plan.list--/properties/page"/>`{number}`<br>
 - **pages**
    <a name="response.plan.list--/properties/pages"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Update-plan'></a> Update plan
<p>Update paypal plan with a special case for a free plan <strong>WARNING</strong>: this method is prone to race conditions, and, therefore, requires a lock to be used before updating data</p>

Source: [src/actions/plan/update.js](src/actions/plan/update.js).
```
AMQP <prefix>.plan.state
```


### Request schema

<a name="plan.update--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["id"]`, `minProperties`: `2`<br>
Properties:

 - **id**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **alias**
    <a name="plan.update--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`, `not`: `{"const":"free"}`<br>
 - **title**
    <a name="plan.update--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="plan.update--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **hidden**
    <a name="plan.update--/properties/hidden"/>`{boolean}`<br>
 - **subscriptions**
    <a name="plan.update--/properties/subscriptions"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Constraints: `minProperties`: `1`<br>
    Properties:
    
     - **monthly**
        [Subscription(plan.update#/definitions/subscription)](#plan.update--/definitions/subscription)
     - **yearly**
        [Subscription(plan.update#/definitions/subscription)](#plan.update--/definitions/subscription)
    
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)

**Definitions**:

 - **plan.update#/definitions/subscription**
    <a name="plan.update--/definitions/subscription"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Constraints: `minProperties`: `1`<br>
    Properties:
    
     - **models**
        <a name="plan.update--/definitions/subscription/properties/models"/>`{integer}`<br>
        Constraints: `minimum`: `0`<br>
     - **modelPrice**
        <a name="plan.update--/definitions/subscription/properties/modelPrice"/>`{number}`<br>
        Constraints: `minimum`: `0.01`<br>
    
    <br>


### Response schema:

<a name="response.plan.update--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    [Payment plan id(common#/definitions/planId)](#common--/definitions/planId)
 - **state**
    <a name="response.plan.update--/properties/state"/>`{string}`<br>
 - **alias**
    <a name="response.plan.update--/properties/alias"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.plan.update--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **title**
    <a name="response.plan.update--/properties/title"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.plan.update--/properties/description"/>`{string}`<br>
 - **hidden**
    <a name="response.plan.update--/properties/hidden"/>`{boolean}`<br>
 - **level**
    [(plan#/definitions/level)](#plan--/definitions/level)
 - **subs**
    <a name="response.plan.update--/properties/subs"/>`{array}`<br>
    Each item should be:
    [[response.common] Subscription object(response.common.subscription#)](#response.common.subscription--)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **meta**
    [(plan#/definitions/meta)](#plan--/definitions/meta)
 - **type**
    [(plan#/definitions/type)](#plan--/definitions/type)
 - **month**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)
 - **year**
    [(data-types#/definitions/nullable-string)](#data-types--/definitions/nullable-string)





**[⬆ Back to Top](#top)**
# <a name='Sale'></a> Sale
## <a name='Create-sale'></a> Create sale
<p>Creates new sale</p>

Source: [src/actions/sale/create.js](src/actions/sale/create.js).
```
AMQP <prefix>.sale.create
```


### Request schema

<a name="sale.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["owner","amount"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **amount**
    <a name="sale.create--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `10000`<br>


### Response schema:

<a name="response.sale.create--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **token**
    <a name="response.sale.create--/properties/token"/>`{string}`<br>
 - **url**
    <a name="response.sale.create--/properties/url"/>`{string}`<br>
 - **sale**
    [[response.common] Sale object(response.common.sale#)](#response.common.sale--)





**[⬆ Back to Top](#top)**
## <a name='Execute-sale'></a> Execute sale
<p>Executes sale</p>

Source: [src/actions/sale/execute.js](src/actions/sale/execute.js).
```
AMQP <prefix>.sale.execute
```


### Request schema

<a name="sale.create--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["owner","amount"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **amount**
    <a name="sale.create--/properties/amount"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `10000`<br>


### Response schema:

<a name="response.sale.create--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **token**
    <a name="response.sale.create--/properties/token"/>`{string}`<br>
 - **url**
    <a name="response.sale.create--/properties/url"/>`{string}`<br>
 - **sale**
    [[response.common] Sale object(response.common.sale#)](#response.common.sale--)





**[⬆ Back to Top](#top)**
## <a name='Get-sale'></a> Get sale
<p>Returns sale information</p>

Source: [src/actions/sale/get.js](src/actions/sale/get.js).
```
AMQP <prefix>.sale.get
```


### Request schema

<a name="sale.get--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["id"]`<br>
Properties:

 - **id**
    <a name="sale.get--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.sale.get--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **httpStatusCode**
    <a name="response.sale.get--/properties/httpStatusCode"/>`{number}`<br>
    
    payment system response code
    
 - **id**
    <a name="response.sale.get--/properties/id"/>`{string}`<br>
    
    Sale id
    
 - **intent**
    <a name="response.sale.get--/properties/intent"/>`{string}`<br>
    Constraints: `enum`: `["sale","authorize","order"]`<br>
    
    Payment intent
    
 - **state**
    <a name="response.sale.get--/properties/state"/>`{string}`<br>
    
    The state of the sale
    
 - **payer**
    [Payer information(common#/definitions/payer)](#common--/definitions/payer)
 - **cart**
    <a name="response.sale.get--/properties/cart"/>`{string}`<br>
 - **create_time**
    <a name="response.sale.get--/properties/create_time"/>`{string}`<br>
    Constraints: `format`: `"date-time"`<br>
 - **update_time**
    <a name="response.sale.get--/properties/update_time"/>`{string}`<br>
    Constraints: `format`: `"date-time"`<br>
 - **transactions**
    <a name="response.sale.get--/properties/transactions"/>`{array}`<br>
    Each item should be:
    [(#/definitions/transaction)](#response.common.sale--/definitions/transaction)
 - **failed_transactions**
    <a name="response.sale.get--/properties/failed_transactions"/>`{array}`<br>
    Each item should be:
    [(#/definitions/transaction)](#response.common.sale--/definitions/transaction)
 - **billing_agreement_tokens**
    <a name="response.sale.get--/properties/billing_agreement_tokens"/>`{array}`<br>
    Each item should be:
    <a name="response.sale.get--/properties/billing_agreement_tokens/items"/>`{string}`<br>
 - **experience_profile_id**
    <a name="response.sale.get--/properties/experience_profile_id"/>`{string}`<br>
 - **links**
    <a name="response.sale.get--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)

**Definitions**:

 - **response.sale.get#/definitions/transaction**
    <a name="response.sale.get--/definitions/transaction"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **reference_id**
        <a name="response.sale.get--/definitions/transaction/properties/reference_id"/>`{string}`<br>
     - **amount**
        <a name="response.sale.get--/definitions/transaction/properties/amount"/>`{object}`<br>
        Additional properties allowed: `false`<br>
        Properties:
        
         - **currency**
            <a name="response.sale.get--/definitions/transaction/properties/amount/properties/currency"/>`{string}`<br>
         - **total**
            <a name="response.sale.get--/definitions/transaction/properties/amount/properties/total"/>`{number,string}`<br>
         - **details**
            <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details"/>`{object}`<br>
            Additional properties allowed: `true`<br>
            Properties:
            
             - **subtotal**
                <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details/properties/subtotal"/>`{string}`<br>
             - **shipping**
                <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details/properties/shipping"/>`{string}`<br>
             - **insurance**
                <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details/properties/insurance"/>`{string}`<br>
             - **handling_fee**
                <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details/properties/handling_fee"/>`{string}`<br>
             - **shipping_discount**
                <a name="response.sale.get--/definitions/transaction/properties/amount/properties/details/properties/shipping_discount"/>`{string}`<br>
            
        
     - **payee**
        <a name="response.sale.get--/definitions/transaction/properties/payee"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **merchant_id**
            <a name="response.sale.get--/definitions/transaction/properties/payee/properties/merchant_id"/>`{string}`<br>
         - **email**
            <a name="response.sale.get--/definitions/transaction/properties/payee/properties/email"/>`{string}`<br>
            Constraints: `format`: `"email"`<br>
        
     - **description**
        <a name="response.sale.get--/definitions/transaction/properties/description"/>`{string}`<br>
     - **note_to_payee**
        <a name="response.sale.get--/definitions/transaction/properties/note_to_payee"/>`{string}`<br>
     - **custom**
        <a name="response.sale.get--/definitions/transaction/properties/custom"/>`{string}`<br>
     - **invoice_number**
        <a name="response.sale.get--/definitions/transaction/properties/invoice_number"/>`{string}`<br>
     - **notify_url**
        <a name="response.sale.get--/definitions/transaction/properties/notify_url"/>`{string}`<br>
     - **order_url**
        <a name="response.sale.get--/definitions/transaction/properties/order_url"/>`{string}`<br>
     - **item_list**
        <a name="response.sale.get--/definitions/transaction/properties/item_list"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["items"]`<br>
        Properties:
        
         - **additionalProperties**
            <a name="response.sale.get--/definitions/transaction/properties/item_list/properties/additionalProperties"/>
         - **items**
            <a name="response.sale.get--/definitions/transaction/properties/item_list/properties/items"/>`{array}`<br>
            Each item should be:
            [(response.common#/definitions/transaction_item)](#response.common--/definitions/transaction_item)
        
     - **related_resources**
        <a name="response.sale.get--/definitions/transaction/properties/related_resources"/>`{array}`<br>
        Each item should be:
        <a name="response.sale.get--/definitions/transaction/properties/related_resources/items"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        
        See [Paypal API](https://developer.paypal.com/docs/api/payments/v1/#definition-related_resources)
        
    
    <br>





**[⬆ Back to Top](#top)**
## <a name='List-sales'></a> List sales
<p>Returns list of the sales</p>

Source: [src/actions/sale/list.js](src/actions/sale/list.js).
```
AMQP <prefix>.sale.list
```


### Request schema

<a name="sale.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **offset**
    <a name="sale.list--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>
 - **limit**
    <a name="sale.list--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **criteria**
    <a name="sale.list--/properties/criteria"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **order**
    <a name="sale.list--/properties/order"/>`{string}`<br>
    Constraints: `enum`: `["ASC","DESC"]`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.sale.list--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["items","cursor","page","pages"]`<br>
Properties:

 - **items**
    <a name="response.sale.list--/properties/items"/>`{array}`<br>
    
    List of the existing Sales
    
    Each item should be:
    <a name="response.sale.list--/properties/items/items"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **sale**
        [[response.common] Sale object(response.common.sale#)](#response.common.sale--)
     - **owner**
        <a name="response.sale.list--/properties/items/items/properties/owner"/>`{string}`<br>
     - **payer**
        <a name="response.sale.list--/properties/items/items/properties/payer"/>`{string}`<br>
     - **create_time**
        <a name="response.sale.list--/properties/items/items/properties/create_time"/>`{number}`<br>
     - **update_time**
        <a name="response.sale.list--/properties/items/items/properties/update_time"/>`{number}`<br>
     - **cart**
        [(common#/definitions/cart)](#common--/definitions/cart)
    
 - **cursor**
    <a name="response.sale.list--/properties/cursor"/>`{number}`<br>
 - **page**
    <a name="response.sale.list--/properties/page"/>`{number}`<br>
 - **pages**
    <a name="response.sale.list--/properties/pages"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Sync-sale'></a> Sync sale
<p>Performs synchronizations of sales <strong>TODO</strong>: Find response schema</p>

Source: [src/actions/sale/sync.js](src/actions/sale/sync.js).
```
AMQP <prefix>.sale.sync
```


### Request schema

<a name="sale.sync--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **next_id**
    <a name="sale.sync--/properties/next_id"/>`{string}`<br>





**[⬆ Back to Top](#top)**
# <a name='Transaction'></a> Transaction
## <a name='Aggregate-transaction'></a> Aggregate transaction
<p>Performs aggregate operation on filtered transactions</p>

Source: [src/actions/transaction/aggregate.js](src/actions/transaction/aggregate.js).
```
AMQP <prefix>.transaction.aggregate
```


### Request schema

<a name="transaction.aggregate--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["owners","aggregate"]`<br>
Properties:

 - **owners**
    <a name="transaction.aggregate--/properties/owners"/>`{array}`<br>
    Constraints: `minItems`: `1`<br>
    Each item should be:
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **aggregate**
    <a name="transaction.aggregate--/properties/aggregate"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `minProperties`: `1`<br>
    
    Additional properties should be:
    
    
     - <a name="transaction.aggregate--"/>`{string}`<br>
     - Constraints: `enum`: `["sum"]`<br>
    


### Response schema:

<a name="response.transaction.aggregate--"/>`{array}`<br>
Each item should be:
`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **amount**
    <a name="response.transaction.aggregate--/items/properties/amount"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Common-transaction-data'></a> Common transaction data
<p>Retrieves common transaction information for filtered transactions</p>

Source: [src/actions/transaction/common.js](src/actions/transaction/common.js).
```
AMQP <prefix>.transaction.common
```


### Request schema

<a name="transaction.common--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Properties:

 - **offset**
    <a name="transaction.common--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>
 - **limit**
    <a name="transaction.common--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
 - **order**
    <a name="transaction.common--/properties/order"/>`{string}`<br>
    Constraints: `enum`: `["ASC","DESC"]`<br>
 - **criteria**
    <a name="transaction.common--/properties/criteria"/>`{string}`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **type**
    <a name="transaction.common--/properties/type"/>`{string}`<br>
    Constraints: `enum`: `["sale","subscription"]`<br>
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)


### Response schema:

<a name="response.transaction.common--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["items","cursor","page","pages"]`<br>
Properties:

 - **items**
    <a name="response.transaction.common--/properties/items"/>`{array}`<br>
    Each item should be:
    [[response.common] Transaction common information object(response.common.transaction-common#)](#response.common.transaction-common--)
 - **cursor**
    <a name="response.transaction.common--/properties/cursor"/>`{number}`<br>
 - **page**
    <a name="response.transaction.common--/properties/page"/>`{number}`<br>
 - **pages**
    <a name="response.transaction.common--/properties/pages"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Get-transaction'></a> Get transaction
<p>Returns selected trasactions common data</p>

Source: [src/actions/transaction/get.js](src/actions/transaction/get.js).
```
AMQP <prefix>.transaction.get
```


### Request schema

<a name="transaction.aggregate--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["owners","aggregate"]`<br>
Properties:

 - **owners**
    <a name="transaction.aggregate--/properties/owners"/>`{array}`<br>
    Constraints: `minItems`: `1`<br>
    Each item should be:
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **aggregate**
    <a name="transaction.aggregate--/properties/aggregate"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `minProperties`: `1`<br>
    
    Additional properties should be:
    
    
     - <a name="transaction.aggregate--"/>`{string}`<br>
     - Constraints: `enum`: `["sum"]`<br>
    


### Response schema:

<a name="response.transaction.aggregate--"/>`{array}`<br>
Each item should be:
`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **amount**
    <a name="response.transaction.aggregate--/items/properties/amount"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='List-transactions'></a> List transactions
<p>Return the list of the agreement transactions data</p>

Source: [src/actions/transaction/list.js](src/actions/transaction/list.js).
```
AMQP <prefix>.transaction.list
```


### Request schema

<a name="transaction.list--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **offset**
    <a name="transaction.list--/properties/offset"/>`{integer}`<br>
    Constraints: `minimum`: `0`<br>
 - **limit**
    <a name="transaction.list--/properties/limit"/>`{integer}`<br>
    Constraints: `minimum`: `1`, `maximum`: `100`<br>
 - **filter**
    [(common#/definitions/filter)](#common--/definitions/filter)
 - **criteria**
    <a name="transaction.list--/properties/criteria"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **order**
    <a name="transaction.list--/properties/order"/>`{string}`<br>
    Constraints: `enum`: `["ASC","DESC"]`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)


### Response schema:

<a name="response.transaction.list--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["items","cursor","page","pages"]`<br>
Properties:

 - **items**
    <a name="response.transaction.list--/properties/items"/>`{array}`<br>
    Each item should be:
    [[response.common] Transaction object(response.common.transaction#)](#response.common.transaction--)
 - **cursor**
    <a name="response.transaction.list--/properties/cursor"/>`{number}`<br>
 - **page**
    <a name="response.transaction.list--/properties/page"/>`{number}`<br>
 - **pages**
    <a name="response.transaction.list--/properties/pages"/>`{number}`<br>





**[⬆ Back to Top](#top)**
## <a name='Sync-transactions'></a> Sync transactions
<p>Syncs transactions for agreement</p>

Source: [src/actions/transaction/sync.js](src/actions/transaction/sync.js).
```
AMQP <prefix>.transaction.sync
```


### Request schema

<a name="transaction.sync--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["id"]`<br>
Properties:

 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **id**
    <a name="transaction.sync--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **start**
    <a name="transaction.sync--/properties/start"/>`{string}`<br>
    Constraints: `format`: `"date"`<br>
 - **end**
    <a name="transaction.sync--/properties/end"/>`{string}`<br>
    Constraints: `format`: `"date"`<br>


### Response schema:

<a name="response.transaction.sync--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **agreement**
    [[response.common] Agreement object(response.common.agreement#)](#response.common.agreement--)
 - **transactions**
    <a name="response.transaction.sync--/properties/transactions"/>`{array}`<br>
    Each item should be:
    [[response.common] Transaction information object(response.common.transaction-info#)](#response.common.transaction-info--)





**[⬆ Back to Top](#top)**
## <a name='Sync-Updated-transactions'></a> Sync Updated transactions
<p>Syncs updated transactions for agreement</p>

Source: [src/actions/transaction/sync-updated.js](src/actions/transaction/sync-updated.js).
```
AMQP <prefix>.transaction.sync-updated
```


### Request schema

<a name="transaction.sync-updated--"/>`{object}`<br>
Additional properties allowed: `false`<br>

### Response schema:

<a name="response.transaction.sync-updated--"/>`{number}`<br>




**[⬆ Back to Top](#top)**
# <a name='zSchemaDefinitions'></a> zSchemaDefinitions
## <a name='[common]-Agreement-object'></a> [common] Agreement object
Agreement object structure

Source: [agreement.json](agreement.json).
```
SCHEMA agreement
```



### Schema

<a name="agreement--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["name","description","payer","plan"]`<br>

Agreement object structure

Properties:

 - **id**
    <a name="agreement--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **state**
    <a name="agreement--/properties/state"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="agreement--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="agreement--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **start_date**
    <a name="agreement--/properties/start_date"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **agreement_details**
    [Agreement details(common#/definitions/agreement_details)](#common--/definitions/agreement_details)
 - **payer**
    [Payer information(common#/definitions/payer)](#common--/definitions/payer)
 - **shipping_address**
    [Address(common#/definitions/address)](#common--/definitions/address)
 - **override_merchant_preferences**
    [Merchant preferences(common#/definitions/merchant_preferences)](#common--/definitions/merchant_preferences)
 - **override_charge_models**
    <a name="agreement--/properties/override_charge_models"/>`{array}`<br>
    Each item should be:
    [Override charge model(common#/definitions/override_charge_model)](#common--/definitions/override_charge_model)
 - **plan**
    *Could be oneOf:*
    
     - [(plan.create#)](#plan.create--)
     - <a name="agreement--/properties/plan/oneOf/1"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["id"]`<br>
        Properties:
        
         - **id**
            <a name="agreement--/properties/plan/oneOf/1/properties/id"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
        
    
 - **create_time**
    <a name="agreement--/properties/create_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **update_time**
    <a name="agreement--/properties/update_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **links**
    <a name="agreement--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)



**[⬆ Back to Top](#top)**
## <a name='[common]-Definitions'></a> [common] Definitions
Source: [common.json](common.json).
```
SCHEMA common
```



### Schema

<a name="common--"/>

**Definitions**:


 - **common#/definitions/owner**
    <a name="common--/definitions/owner"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
    
    Identification of owner
    
    <br>
 - **common#/definitions/chargeId**
    <a name="common--/definitions/chargeId"/>`{string}`<br>
    Constraints: `format`: `"uuid"`<br>
    
    Identification of charge
    
    <br>
 - **common#/definitions/currency**
    <a name="common--/definitions/currency"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["currency","value"]`<br>
    
    Generic currency object
    
    Properties:
    
     - **currency**
        <a name="common--/definitions/currency/properties/currency"/>`{string}`<br>
        Constraints: `minLength`: `3`, `maxLength`: `3`<br>
     - **value**
        <a name="common--/definitions/currency/properties/value"/>`{string}`<br>
        Constraints: `pattern`: `"\\d{1,7}(\\.\\d{1,2})?$"`<br>
    
    <br>
 - **common#/definitions/links**
    <a name="common--/definitions/links"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **href**
        <a name="common--/definitions/links/properties/href"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **rel**
        <a name="common--/definitions/links/properties/rel"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **method**
        <a name="common--/definitions/links/properties/method"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/term**
    <a name="common--/definitions/term"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["type","max_billing_amount","occurences","amount_range","buyer_editable"]`<br>
    Properties:
    
     - **id**
        <a name="common--/definitions/term/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **type**
        <a name="common--/definitions/term/properties/type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **max_billing_amount**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **occurences**
        <a name="common--/definitions/term/properties/occurences"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **amount_range**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **buyer_editable**
        <a name="common--/definitions/term/properties/buyer_editable"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/payment_definition**
    <a name="common--/definitions/payment_definition"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["name","type","frequency_interval","frequency","cycles","amount"]`<br>
    Properties:
    
     - **id**
        <a name="common--/definitions/payment_definition/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **name**
        <a name="common--/definitions/payment_definition/properties/name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **type**
        <a name="common--/definitions/payment_definition/properties/type"/>`{string}`<br>
        Constraints: `minLength`: `1`, `enum`: `["trial","regular","TRIAL","REGULAR"]`<br>
     - **frequency_interval**
        <a name="common--/definitions/payment_definition/properties/frequency_interval"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **frequency**
        <a name="common--/definitions/payment_definition/properties/frequency"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **cycles**
        <a name="common--/definitions/payment_definition/properties/cycles"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **amount**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **charge_models**
        <a name="common--/definitions/payment_definition/properties/charge_models"/>`{array}`<br>
        Each item should be:
        <a name="common--/definitions/payment_definition/properties/charge_models/items"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["type","amount"]`<br>
        Properties:
        
         - **id**
            <a name="common--/definitions/payment_definition/properties/charge_models/items/properties/id"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - **type**
            <a name="common--/definitions/payment_definition/properties/charge_models/items/properties/type"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - **amount**
            [(common#/definitions/currency)](#common--/definitions/currency)
        
    
    <br>
 - **common#/definitions/merchant_preferences**
    <a name="common--/definitions/merchant_preferences"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["cancel_url","return_url"]`<br>
    Properties:
    
     - **id**
        <a name="common--/definitions/merchant_preferences/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **setup_fee**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **cancel_url**
        <a name="common--/definitions/merchant_preferences/properties/cancel_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **return_url**
        <a name="common--/definitions/merchant_preferences/properties/return_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **notify_url**
        <a name="common--/definitions/merchant_preferences/properties/notify_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **max_fail_attempts**
        <a name="common--/definitions/merchant_preferences/properties/max_fail_attempts"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **auto_bull_amount**
        <a name="common--/definitions/merchant_preferences/properties/auto_bull_amount"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **initial_fail_amount_action**
        <a name="common--/definitions/merchant_preferences/properties/initial_fail_amount_action"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **accepted_payment_type**
        <a name="common--/definitions/merchant_preferences/properties/accepted_payment_type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **char_set**
        <a name="common--/definitions/merchant_preferences/properties/char_set"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/agreement_details**
    <a name="common--/definitions/agreement_details"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **outstanding_balance**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **cycles_remaining**
        <a name="common--/definitions/agreement_details/properties/cycles_remaining"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **cycles_completed**
        <a name="common--/definitions/agreement_details/properties/cycles_completed"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **next_billing_date**
        <a name="common--/definitions/agreement_details/properties/next_billing_date"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **last_payment_date**
        <a name="common--/definitions/agreement_details/properties/last_payment_date"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **last_payment_amount**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **final_payment_date**
        <a name="common--/definitions/agreement_details/properties/final_payment_date"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **failed_payment_count**
        <a name="common--/definitions/agreement_details/properties/failed_payment_count"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/payer**
    <a name="common--/definitions/payer"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["payment_method"]`<br>
    Properties:
    
     - **payment_method**
        <a name="common--/definitions/payer/properties/payment_method"/>`{string}`<br>
        Constraints: `enum`: `["credit_card","bank","paypal"]`<br>
     - **status**
        <a name="common--/definitions/payer/properties/status"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **account_type**
        <a name="common--/definitions/payer/properties/account_type"/>`{string}`<br>
        Constraints: `enum`: `["business","personal","premier"]`<br>
     - **account_age**
        <a name="common--/definitions/payer/properties/account_age"/>`{string}`<br>
     - **funding_instruments**
        <a name="common--/definitions/payer/properties/funding_instruments"/>`{array}`<br>
        Each item should be:
        [Funding instruments(common#/definitions/funding_instrument)](#common--/definitions/funding_instrument)
     - **funding_option_id**
        <a name="common--/definitions/payer/properties/funding_option_id"/>`{string}`<br>
     - **payer_info**
        [Payer information(common#/definitions/payer_info)](#common--/definitions/payer_info)
    
    <br>
 - **common#/definitions/funding_instrument**
    <a name="common--/definitions/funding_instrument"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **credit_card**
        [Credit card information(common#/definitions/credit_card)](#common--/definitions/credit_card)
     - **credit_card_token**
        [Credit card token(common#/definitions/credit_card_token)](#common--/definitions/credit_card_token)
    
    <br>
 - **common#/definitions/credit_card**
    <a name="common--/definitions/credit_card"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["number","type","expire_month","expire_year"]`<br>
    Properties:
    
     - **id**
        <a name="common--/definitions/credit_card/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **payer_id**
        <a name="common--/definitions/credit_card/properties/payer_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **number**
        <a name="common--/definitions/credit_card/properties/number"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **type**
        <a name="common--/definitions/credit_card/properties/type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **expire_month**
        <a name="common--/definitions/credit_card/properties/expire_month"/>`{integer}`<br>
     - **expire_year**
        <a name="common--/definitions/credit_card/properties/expire_year"/>`{integer}`<br>
     - **cvv2**
        <a name="common--/definitions/credit_card/properties/cvv2"/>`{string}`<br>
        Constraints: `minLength`: `3`, `maxLength`: `4`<br>
     - **first_name**
        <a name="common--/definitions/credit_card/properties/first_name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **last_name**
        <a name="common--/definitions/credit_card/properties/last_name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **billing_address**
        [Address(common#/definitions/address)](#common--/definitions/address)
     - **external_customer_id**
        <a name="common--/definitions/credit_card/properties/external_customer_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **merchant_id**
        <a name="common--/definitions/credit_card/properties/merchant_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **external_card_id**
        <a name="common--/definitions/credit_card/properties/external_card_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **create_time**
        <a name="common--/definitions/credit_card/properties/create_time"/>`{string}`<br>
        Constraints: `format`: `"date-time"`<br>
     - **update_time**
        <a name="common--/definitions/credit_card/properties/update_time"/>`{string}`<br>
        Constraints: `format`: `"date-time"`<br>
     - **state**
        <a name="common--/definitions/credit_card/properties/state"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **valid_until**
        <a name="common--/definitions/credit_card/properties/valid_until"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/credit_card_token**
    <a name="common--/definitions/credit_card_token"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["credit_card_id"]`<br>
    Properties:
    
     - **credit_card_id**
        <a name="common--/definitions/credit_card_token/properties/credit_card_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **payer_id**
        <a name="common--/definitions/credit_card_token/properties/payer_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **last4**
        <a name="common--/definitions/credit_card_token/properties/last4"/>`{string}`<br>
        Constraints: `minLength`: `4`, `maxLength`: `4`<br>
     - **type**
        <a name="common--/definitions/credit_card_token/properties/type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **expire_year**
        <a name="common--/definitions/credit_card_token/properties/expire_year"/>`{integer}`<br>
     - **expire_month**
        <a name="common--/definitions/credit_card_token/properties/expire_month"/>`{integer}`<br>
    
    <br>
 - **common#/definitions/payer_info**
    <a name="common--/definitions/payer_info"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **email**
        <a name="common--/definitions/payer_info/properties/email"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `127`<br>
     - **salutation**
        <a name="common--/definitions/payer_info/properties/salutation"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **first_name**
        <a name="common--/definitions/payer_info/properties/first_name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **middle_name**
        <a name="common--/definitions/payer_info/properties/middle_name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **last_name**
        <a name="common--/definitions/payer_info/properties/last_name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **suffix**
        <a name="common--/definitions/payer_info/properties/suffix"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **payer_id**
        <a name="common--/definitions/payer_info/properties/payer_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **phone**
        <a name="common--/definitions/payer_info/properties/phone"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **country_code**
        <a name="common--/definitions/payer_info/properties/country_code"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **shipping_address**
        [Shipping address(common#/definitions/shipping_address)](#common--/definitions/shipping_address)
     - **tax_id_type**
        <a name="common--/definitions/payer_info/properties/tax_id_type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **tax_id**
        <a name="common--/definitions/payer_info/properties/tax_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **common#/definitions/address**
    <a name="common--/definitions/address"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["line1","city","country_code"]`<br>
    Properties:
    
     - **line1**
        <a name="common--/definitions/address/properties/line1"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `100`<br>
     - **line2**
        <a name="common--/definitions/address/properties/line2"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `100`<br>
     - **city**
        <a name="common--/definitions/address/properties/city"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `50`<br>
     - **country_code**
        <a name="common--/definitions/address/properties/country_code"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `2`<br>
     - **postal_code**
        <a name="common--/definitions/address/properties/postal_code"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `20`<br>
     - **state**
        <a name="common--/definitions/address/properties/state"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `100`<br>
     - **phone**
        <a name="common--/definitions/address/properties/phone"/>`{string}`<br>
        Constraints: `minLength`: `1`, `maxLength`: `50`<br>
    
    <br>
 - **common#/definitions/shipping_address**
    *Could be allOf:*
    
     - [Address(common#/definitions/address)](#common--/definitions/address)
     - <a name="common--/definitions/shipping_address/allOf/1"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **recipient_name**
            <a name="common--/definitions/shipping_address/allOf/1/properties/recipient_name"/>`{string}`<br>
            Constraints: `minLength`: `0`<br>
         - **type**
            <a name="common--/definitions/shipping_address/allOf/1/properties/type"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
        
    
    <br>
 - **common#/definitions/override_charge_model**
    <a name="common--/definitions/override_charge_model"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["charge_id","amount"]`<br>
    Properties:
    
     - **charge_id**
        <a name="common--/definitions/override_charge_model/properties/charge_id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **amount**
        [(common#/definitions/currency)](#common--/definitions/currency)
    
    <br>
 - **common#/definitions/item**
    <a name="common--/definitions/item"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["quantity","name","price","currency"]`<br>
    Properties:
    
     - **quantity**
        <a name="common--/definitions/item/properties/quantity"/>`{string}`<br>
     - **name**
        <a name="common--/definitions/item/properties/name"/>`{string}`<br>
     - **description**
        <a name="common--/definitions/item/properties/description"/>`{string}`<br>
     - **price**
        <a name="common--/definitions/item/properties/price"/>`{string}`<br>
     - **tax**
        <a name="common--/definitions/item/properties/tax"/>`{string}`<br>
     - **currency**
        <a name="common--/definitions/item/properties/currency"/>`{string}`<br>
     - **sku**
        <a name="common--/definitions/item/properties/sku"/>`{string}`<br>
     - **url**
        <a name="common--/definitions/item/properties/url"/>`{string}`<br>
     - **category**
        <a name="common--/definitions/item/properties/category"/>`{string}`<br>
        Constraints: `enum`: `["digital","physical"]`<br>
     - **supplementary_data**
        <a name="common--/definitions/item/properties/supplementary_data"/>`{array}`<br>
        Each item should be:
        [KeyValue object(common#/definitions/kv)](#common--/definitions/kv)
     - **postback_data**
        <a name="common--/definitions/item/properties/postback_data"/>`{array}`<br>
        Each item should be:
        [KeyValue object(common#/definitions/kv)](#common--/definitions/kv)
    
    <br>
 - **common#/definitions/kv**
    <a name="common--/definitions/kv"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Constraints: `required`: `["name","value"]`<br>
    Properties:
    
     - **name**
        <a name="common--/definitions/kv/properties/name"/>`{string}`<br>
     - **value**
        <a name="common--/definitions/kv/properties/value"/>`{string}`<br>
    
    <br>
 - **common#/definitions/planId**
    *Could be oneOf:*
    
     - <a name="common--/definitions/planId/oneOf/0"/>
        Constraints: `pattern`: `"^P-.+(\\|P-.+)?$"`<br>
     - <a name="common--/definitions/planId/oneOf/1"/>
        Constraints: `const`: `"free"`<br>
    
    <br>
 - **common#/definitions/paymentId**
    <a name="common--/definitions/paymentId"/>`{string}`<br>
    Constraints: `minLength`: `1`, `pattern`: `"^PAYID-.+(\\|PAYID-.+)?"`<br>
    <br>
 - **common#/definitions/filter**
    <a name="common--/definitions/filter"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Search filter
    
    Properties:
    
     - **#multi**
        <a name="common--/definitions/filter/properties/--multi"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["fields","match"]`<br>
        
        See `redis-filtered-sort`
        
        Properties:
        
         - **fields**
            <a name="common--/definitions/filter/properties/--multi/properties/fields"/>`{array}`<br>
            Constraints: `minItems`: `1`<br>
            
            Fields list used in search
            
            Each item should be:
            <a name="common--/definitions/filter/properties/--multi/properties/fields/items"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - **match**
            <a name="common--/definitions/filter/properties/--multi/properties/match"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
            
            Match used in search
            
        
    
    
    Additional properties should be:
    
    
     - *Could be oneOf:*
         - <a name="common--/oneOf/0"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - <a name="common--/oneOf/1"/>`{object}`<br>
            Additional properties allowed: `true`<br>
            Constraints: `minProperties`: `1`, `maxProperties`: `2`<br>
            
            **Pattern properties**:
            
            
             - **^(ne&#123;eq&#123;match)$**
                <a name="common--/oneOf/1/patternProperties/^(ne|eq|match)$"/>`{string}`<br>
                Constraints: `minLength`: `1`<br>
             - **^(gte&#123;lte)$**
                <a name="common--/oneOf/1/patternProperties/^(gte|lte)$"/>`{number}`<br>
             - **^(some)$**
                <a name="common--/oneOf/1/patternProperties/^(some)$"/>`{array}`<br>
                Constraints: `uniqueItems`: `true`<br>
                Each item should be:
                <a name="common--/oneOf/1/patternProperties/^(some)$/items"/>`{string}`<br>
                Constraints: `minLength`: `1`<br>
            
        
    
    <br>
 - **common#/definitions/cart**
    <a name="common--/definitions/cart"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Constraints: `required`: `["id","shipping_type","shipping_price","printing_price","service_price","user_price"]`<br>
    Properties:
    
     - **id**
        <a name="common--/definitions/cart/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **shipping_type**
        <a name="common--/definitions/cart/properties/shipping_type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **shipping_price**
        <a name="common--/definitions/cart/properties/shipping_price"/>`{number}`<br>
        Constraints: `minimum`: `0`, `maximum`: `999999`<br>
     - **printing_price**
        <a name="common--/definitions/cart/properties/printing_price"/>`{number}`<br>
        Constraints: `minimum`: `0`, `maximum`: `999999`<br>
     - **service_price**
        <a name="common--/definitions/cart/properties/service_price"/>`{number}`<br>
        Constraints: `minimum`: `0`, `maximum`: `999999`<br>
     - **user_price**
        <a name="common--/definitions/cart/properties/user_price"/>`{number}`<br>
        Constraints: `minimum`: `0`, `maximum`: `999999`<br>
    
    <br>



**[⬆ Back to Top](#top)**
## <a name='[common]-Extra-`DataTypes`'></a> [common] Extra `DataTypes`
Source: [data-types.json](data-types.json).
```
SCHEMA data-types
```



### Schema

<a name="data-types--"/>

**Definitions**:


 - **data-types#/definitions/nullable-string**
    <a name="data-types--/definitions/nullable-string"/>`{string,null}`<br>
    <br>



**[⬆ Back to Top](#top)**
## <a name='[common]-Payment-plan-object'></a> [common] Payment plan object
Source: [plan.json](plan.json).
```
SCHEMA plan
```



### Schema

<a name="plan--"/>`{object}`<br>
Additional properties allowed: `true`<br>
Constraints: `required`: `["name","description","type","payment_definitions"]`<br>
Properties:

 - **id**
    <a name="plan--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="plan--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="plan--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **type**
    [(#/definitions/type)](#plan--/definitions/type)
 - **state**
    <a name="plan--/properties/state"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **create_time**
    <a name="plan--/properties/create_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **update_time**
    <a name="plan--/properties/update_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **payment_definitions**
    <a name="plan--/properties/payment_definitions"/>`{array}`<br>
    Each item should be:
    [Payment definition(common#/definitions/payment_definition)](#common--/definitions/payment_definition)
 - **terms**
    <a name="plan--/properties/terms"/>`{array}`<br>
    Each item should be:
    [Term(common#/definitions/term)](#common--/definitions/term)
 - **merchant_preferences**
    [Merchant preferences(common#/definitions/merchant_preferences)](#common--/definitions/merchant_preferences)
 - **links**
    <a name="plan--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)

**Definitions**:

 - **plan#/definitions/meta**
    <a name="plan--/definitions/meta"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    
    Variable metadata object
    
    
    Additional properties should be:
    
    
     - [(#/definitions/feature)](#plan--/definitions/feature)
    
    <br>
 - **plan#/definitions/level**
    <a name="plan--/definitions/level"/>`{integer}`<br>
    <br>
 - **plan#/definitions/feature**
    <a name="plan--/definitions/feature"/>`{object}`<br>
    Additional properties allowed: `true`<br>
    Properties:
    
     - **description**
        <a name="plan--/definitions/feature/properties/description"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **type**
        <a name="plan--/definitions/feature/properties/type"/>`{string}`<br>
        Constraints: `enum`: `["boolean","number"]`<br>
     - **value**
        <a name="plan--/definitions/feature/properties/value"/>`{number}`<br>
        
        0/1 for boolean and any other number to compare with for number type
        
    
    <br>
 - **plan#/definitions/type**
    <a name="plan--/definitions/type"/>`{string}`<br>
    Constraints: `minLength`: `1`, `enum`: `["fixed","infinite","FIXED","INFINITE"]`<br>
    <br>



**[⬆ Back to Top](#top)**
## <a name='[common]-Subscription-object'></a> [common] Subscription object
Source: [subscription.json](subscription.json).
```
SCHEMA subscription
```



### Schema

<a name="subscription--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["name","models"]`<br>
Properties:

 - **models**
    <a name="subscription--/properties/models"/>`{number}`<br>
 - **price**
    <a name="subscription--/properties/price"/>`{number}`<br>
 - **name**
    <a name="subscription--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Agreement-object'></a> [response.common] Agreement object
Source: [response/agreement.json](response/agreement.json).
```
SCHEMA response.common.agreement
```



### Schema

<a name="response.common.agreement--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **t**
    <a name="response.common.agreement--/properties/t"/>`{integer}`<br>
 - **httpStatusCode**
    <a name="response.common.agreement--/properties/httpStatusCode"/>`{integer}`<br>
 - **id**
    <a name="response.common.agreement--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **state**
    <a name="response.common.agreement--/properties/state"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.common.agreement--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.common.agreement--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **start_date**
    <a name="response.common.agreement--/properties/start_date"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **agreement_details**
    [Agreement details(common#/definitions/agreement_details)](#common--/definitions/agreement_details)
 - **payer**
    [Payer information(common#/definitions/payer)](#common--/definitions/payer)
 - **shipping_address**
    [Address(common#/definitions/address)](#common--/definitions/address)
 - **override_merchant_preferences**
    [Merchant preferences(common#/definitions/merchant_preferences)](#common--/definitions/merchant_preferences)
 - **override_charge_models**
    <a name="response.common.agreement--/properties/override_charge_models"/>`{array}`<br>
    Each item should be:
    [Override charge model(common#/definitions/override_charge_model)](#common--/definitions/override_charge_model)
 - **plan**
    [[response.common] Payment plan object(response.common.plan#)](#response.common.plan--)
 - **create_time**
    <a name="response.common.agreement--/properties/create_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **update_time**
    <a name="response.common.agreement--/properties/update_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **links**
    <a name="response.common.agreement--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Definitions'></a> [response.common] Definitions
Source: [response/common.json](response/common.json).
```
SCHEMA response.common
```



### Schema

<a name="response.common--"/>

**Definitions**:


 - **response.common#/definitions/payment_definition**
    <a name="response.common--/definitions/payment_definition"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **id**
        <a name="response.common--/definitions/payment_definition/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **name**
        <a name="response.common--/definitions/payment_definition/properties/name"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **type**
        <a name="response.common--/definitions/payment_definition/properties/type"/>`{string}`<br>
        Constraints: `minLength`: `1`, `enum`: `["trial","regular","TRIAL","REGULAR"]`<br>
     - **frequency_interval**
        <a name="response.common--/definitions/payment_definition/properties/frequency_interval"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **frequency**
        <a name="response.common--/definitions/payment_definition/properties/frequency"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **cycles**
        <a name="response.common--/definitions/payment_definition/properties/cycles"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **amount**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **charge_models**
        <a name="response.common--/definitions/payment_definition/properties/charge_models"/>`{array}`<br>
        Each item should be:
        <a name="response.common--/definitions/payment_definition/properties/charge_models/items"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["type","amount"]`<br>
        Properties:
        
         - **id**
            <a name="response.common--/definitions/payment_definition/properties/charge_models/items/properties/id"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - **type**
            <a name="response.common--/definitions/payment_definition/properties/charge_models/items/properties/type"/>`{string}`<br>
            Constraints: `minLength`: `1`<br>
         - **amount**
            [(common#/definitions/currency)](#common--/definitions/currency)
        
    
    <br>
 - **response.common#/definitions/merchant_preferences**
    <a name="response.common--/definitions/merchant_preferences"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **id**
        <a name="response.common--/definitions/merchant_preferences/properties/id"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **setup_fee**
        [(common#/definitions/currency)](#common--/definitions/currency)
     - **cancel_url**
        <a name="response.common--/definitions/merchant_preferences/properties/cancel_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **return_url**
        <a name="response.common--/definitions/merchant_preferences/properties/return_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **notify_url**
        <a name="response.common--/definitions/merchant_preferences/properties/notify_url"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **max_fail_attempts**
        <a name="response.common--/definitions/merchant_preferences/properties/max_fail_attempts"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **auto_bill_amount**
        <a name="response.common--/definitions/merchant_preferences/properties/auto_bill_amount"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **initial_fail_amount_action**
        <a name="response.common--/definitions/merchant_preferences/properties/initial_fail_amount_action"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **accepted_payment_type**
        <a name="response.common--/definitions/merchant_preferences/properties/accepted_payment_type"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
     - **char_set**
        <a name="response.common--/definitions/merchant_preferences/properties/char_set"/>`{string}`<br>
        Constraints: `minLength`: `1`<br>
    
    <br>
 - **response.common#/definitions/amount**
    <a name="response.common--/definitions/amount"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **currency**
        <a name="response.common--/definitions/amount/properties/currency"/>`{string}`<br>
     - **value**
        <a name="response.common--/definitions/amount/properties/value"/>`{number,string}`<br>
    
    <br>
 - **response.common#/definitions/transaction_item**
    <a name="response.common--/definitions/transaction_item"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **quantity**
        <a name="response.common--/definitions/transaction_item/properties/quantity"/>`{number,string}`<br>
     - **name**
        <a name="response.common--/definitions/transaction_item/properties/name"/>`{string}`<br>
     - **description**
        <a name="response.common--/definitions/transaction_item/properties/description"/>`{string}`<br>
     - **price**
        <a name="response.common--/definitions/transaction_item/properties/price"/>`{string}`<br>
     - **tax**
        <a name="response.common--/definitions/transaction_item/properties/tax"/>`{string}`<br>
     - **currency**
        <a name="response.common--/definitions/transaction_item/properties/currency"/>`{string}`<br>
    
    <br>



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Payment-plan-object'></a> [response.common] Payment plan object
Source: [response/plan.json](response/plan.json).
```
SCHEMA response.common.plan
```



### Schema

<a name="response.common.plan--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    <a name="response.common.plan--/properties/id"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **name**
    <a name="response.common.plan--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **description**
    <a name="response.common.plan--/properties/description"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **hidden**
    <a name="response.common.plan--/properties/hidden"/>`{boolean}`<br>
 - **type**
    [(plan#/definitions/type)](#plan--/definitions/type)
 - **state**
    <a name="response.common.plan--/properties/state"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **create_time**
    <a name="response.common.plan--/properties/create_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **update_time**
    <a name="response.common.plan--/properties/update_time"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **payment_definitions**
    <a name="response.common.plan--/properties/payment_definitions"/>`{array}`<br>
    Each item should be:
    [(response.common#/definitions/payment_definition)](#response.common--/definitions/payment_definition)
 - **terms**
    <a name="response.common.plan--/properties/terms"/>`{array}`<br>
    Each item should be:
    [Term(common#/definitions/term)](#common--/definitions/term)
 - **merchant_preferences**
    [(response.common#/definitions/merchant_preferences)](#response.common--/definitions/merchant_preferences)
 - **links**
    <a name="response.common.plan--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)
 - **httpStatusCode**
    <a name="response.common.plan--/properties/httpStatusCode"/>`{integer}`<br>



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Sale-object'></a> [response.common] Sale object
Source: [response/sale.json](response/sale.json).
```
SCHEMA response.common.sale
```



### Schema

<a name="response.common.sale--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **httpStatusCode**
    <a name="response.common.sale--/properties/httpStatusCode"/>`{number}`<br>
    
    payment system response code
    
 - **id**
    <a name="response.common.sale--/properties/id"/>`{string}`<br>
    
    Sale id
    
 - **intent**
    <a name="response.common.sale--/properties/intent"/>`{string}`<br>
    Constraints: `enum`: `["sale","authorize","order"]`<br>
    
    Payment intent
    
 - **state**
    <a name="response.common.sale--/properties/state"/>`{string}`<br>
    
    The state of the sale
    
 - **payer**
    [Payer information(common#/definitions/payer)](#common--/definitions/payer)
 - **cart**
    <a name="response.common.sale--/properties/cart"/>`{string}`<br>
 - **create_time**
    <a name="response.common.sale--/properties/create_time"/>`{string}`<br>
    Constraints: `format`: `"date-time"`<br>
 - **update_time**
    <a name="response.common.sale--/properties/update_time"/>`{string}`<br>
    Constraints: `format`: `"date-time"`<br>
 - **transactions**
    <a name="response.common.sale--/properties/transactions"/>`{array}`<br>
    Each item should be:
    [(#/definitions/transaction)](#response.common.sale--/definitions/transaction)
 - **failed_transactions**
    <a name="response.common.sale--/properties/failed_transactions"/>`{array}`<br>
    Each item should be:
    [(#/definitions/transaction)](#response.common.sale--/definitions/transaction)
 - **billing_agreement_tokens**
    <a name="response.common.sale--/properties/billing_agreement_tokens"/>`{array}`<br>
    Each item should be:
    <a name="response.common.sale--/properties/billing_agreement_tokens/items"/>`{string}`<br>
 - **experience_profile_id**
    <a name="response.common.sale--/properties/experience_profile_id"/>`{string}`<br>
 - **links**
    <a name="response.common.sale--/properties/links"/>`{array}`<br>
    Each item should be:
    [Payment system provided links(common#/definitions/links)](#common--/definitions/links)

**Definitions**:

 - **response.common.sale#/definitions/transaction**
    <a name="response.common.sale--/definitions/transaction"/>`{object}`<br>
    Additional properties allowed: `false`<br>
    Properties:
    
     - **reference_id**
        <a name="response.common.sale--/definitions/transaction/properties/reference_id"/>`{string}`<br>
     - **amount**
        <a name="response.common.sale--/definitions/transaction/properties/amount"/>`{object}`<br>
        Additional properties allowed: `false`<br>
        Properties:
        
         - **currency**
            <a name="response.common.sale--/definitions/transaction/properties/amount/properties/currency"/>`{string}`<br>
         - **total**
            <a name="response.common.sale--/definitions/transaction/properties/amount/properties/total"/>`{number,string}`<br>
         - **details**
            <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details"/>`{object}`<br>
            Additional properties allowed: `true`<br>
            Properties:
            
             - **subtotal**
                <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details/properties/subtotal"/>`{string}`<br>
             - **shipping**
                <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details/properties/shipping"/>`{string}`<br>
             - **insurance**
                <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details/properties/insurance"/>`{string}`<br>
             - **handling_fee**
                <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details/properties/handling_fee"/>`{string}`<br>
             - **shipping_discount**
                <a name="response.common.sale--/definitions/transaction/properties/amount/properties/details/properties/shipping_discount"/>`{string}`<br>
            
        
     - **payee**
        <a name="response.common.sale--/definitions/transaction/properties/payee"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Properties:
        
         - **merchant_id**
            <a name="response.common.sale--/definitions/transaction/properties/payee/properties/merchant_id"/>`{string}`<br>
         - **email**
            <a name="response.common.sale--/definitions/transaction/properties/payee/properties/email"/>`{string}`<br>
            Constraints: `format`: `"email"`<br>
        
     - **description**
        <a name="response.common.sale--/definitions/transaction/properties/description"/>`{string}`<br>
     - **note_to_payee**
        <a name="response.common.sale--/definitions/transaction/properties/note_to_payee"/>`{string}`<br>
     - **custom**
        <a name="response.common.sale--/definitions/transaction/properties/custom"/>`{string}`<br>
     - **invoice_number**
        <a name="response.common.sale--/definitions/transaction/properties/invoice_number"/>`{string}`<br>
     - **notify_url**
        <a name="response.common.sale--/definitions/transaction/properties/notify_url"/>`{string}`<br>
     - **order_url**
        <a name="response.common.sale--/definitions/transaction/properties/order_url"/>`{string}`<br>
     - **item_list**
        <a name="response.common.sale--/definitions/transaction/properties/item_list"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        Constraints: `required`: `["items"]`<br>
        Properties:
        
         - **additionalProperties**
            <a name="response.common.sale--/definitions/transaction/properties/item_list/properties/additionalProperties"/>
         - **items**
            <a name="response.common.sale--/definitions/transaction/properties/item_list/properties/items"/>`{array}`<br>
            Each item should be:
            [(response.common#/definitions/transaction_item)](#response.common--/definitions/transaction_item)
        
     - **related_resources**
        <a name="response.common.sale--/definitions/transaction/properties/related_resources"/>`{array}`<br>
        Each item should be:
        <a name="response.common.sale--/definitions/transaction/properties/related_resources/items"/>`{object}`<br>
        Additional properties allowed: `true`<br>
        
        See [Paypal API](https://developer.paypal.com/docs/api/payments/v1/#definition-related_resources)
        
    
    <br>



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Subscription-object'></a> [response.common] Subscription object
Source: [response/subscription.json](response/subscription.json).
```
SCHEMA response.common.subscription
```



### Schema

<a name="response.common.subscription--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Constraints: `required`: `["name","models","definition","price"]`<br>
Properties:

 - **models**
    <a name="response.common.subscription--/properties/models"/>`{number}`<br>
 - **price**
    <a name="response.common.subscription--/properties/price"/>`{number}`<br>
 - **name**
    <a name="response.common.subscription--/properties/name"/>`{string}`<br>
    Constraints: `minLength`: `1`<br>
 - **definition**
    [Payment definition(common#/definitions/payment_definition)](#common--/definitions/payment_definition)



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Transaction-common-information-object'></a> [response.common] Transaction common information object
Source: [response/transaction-common.json](response/transaction-common.json).
```
SCHEMA response.common.transaction-common
```



### Schema

<a name="response.common.transaction-common--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **id**
    <a name="response.common.transaction-common--/properties/id"/>`{string}`<br>
 - **type**
    <a name="response.common.transaction-common--/properties/type"/>`{number}`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **agreementId**
    <a name="response.common.transaction-common--/properties/agreementId"/>`{string}`<br>
 - **payer**
    <a name="response.common.transaction-common--/properties/payer"/>`{string}`<br>
    Constraints: `format`: `"email"`<br>
 - **date**
    <a name="response.common.transaction-common--/properties/date"/>`{number}`<br>
 - **amount**
    <a name="response.common.transaction-common--/properties/amount"/>`{string}`<br>
 - **description**
    <a name="response.common.transaction-common--/properties/description"/>`{string}`<br>
 - **status**
    <a name="response.common.transaction-common--/properties/status"/>`{string}`<br>



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Transaction-information-object'></a> [response.common] Transaction information object
Source: [response/transaction-info.json](response/transaction-info.json).
```
SCHEMA response.common.transaction-info
```



### Schema

<a name="response.common.transaction-info--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **transaction_id**
    <a name="response.common.transaction-info--/properties/transaction_id"/>`{string}`<br>
 - **status**
    <a name="response.common.transaction-info--/properties/status"/>`{string}`<br>
 - **transaction_type**
    <a name="response.common.transaction-info--/properties/transaction_type"/>`{string}`<br>
 - **payer_email**
    <a name="response.common.transaction-info--/properties/payer_email"/>`{string}`<br>
    Constraints: `format`: `"email"`<br>
 - **payer_name**
    <a name="response.common.transaction-info--/properties/payer_name"/>`{string}`<br>
 - **time_stamp**
    <a name="response.common.transaction-info--/properties/time_stamp"/>`{string}`<br>
    Constraints: `format`: `"date-time"`<br>
 - **time_zone**
    <a name="response.common.transaction-info--/properties/time_zone"/>`{string}`<br>
 - **amount**
    [Amount(response.common#/definitions/amount)](#response.common--/definitions/amount)
 - **fee_amount**
    [Fee amount(response.common#/definitions/amount)](#response.common--/definitions/amount)
 - **net_amount**
    [Net amount(response.common#/definitions/amount)](#response.common--/definitions/amount)



**[⬆ Back to Top](#top)**
## <a name='[response.common]-Transaction-object'></a> [response.common] Transaction object
Source: [response/transaction.json](response/transaction.json).
```
SCHEMA response.common.transaction
```



### Schema

<a name="response.common.transaction--"/>`{object}`<br>
Additional properties allowed: `false`<br>
Properties:

 - **agreement**
    <a name="response.common.transaction--/properties/agreement"/>`{string}`<br>
 - **payer_email**
    <a name="response.common.transaction--/properties/payer_email"/>`{string}`<br>
    Constraints: `format`: `"email"`<br>
 - **status**
    <a name="response.common.transaction--/properties/status"/>`{string}`<br>
 - **owner**
    [Payment owner(common#/definitions/owner)](#common--/definitions/owner)
 - **transaction_type**
    <a name="response.common.transaction--/properties/transaction_type"/>`{string}`<br>
 - **transaction**
    [[response.common] Transaction information object(response.common.transaction-info#)](#response.common.transaction-info--)
 - **time_stamp**
    <a name="response.common.transaction--/properties/time_stamp"/>`{number}`<br>



**[⬆ Back to Top](#top)**
