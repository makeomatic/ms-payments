# [8.5.0](https://github.com/makeomatic/ms-payments/compare/v8.4.1...v8.5.0) (2020-09-25)


### Features

* response docs ([#118](https://github.com/makeomatic/ms-payments/issues/118)) ([769bfac](https://github.com/makeomatic/ms-payments/commit/769bfac7c5548197fbccf0b318f54a8642f6df7b))

## [8.4.1](https://github.com/makeomatic/ms-payments/compare/v8.4.0...v8.4.1) (2020-08-31)


### Bug Fixes

* test alias update ([#121](https://github.com/makeomatic/ms-payments/issues/121)) ([aa93a91](https://github.com/makeomatic/ms-payments/commit/aa93a91f4b13c12e0023bd2bbac44119dfee15a6))

# [8.4.0](https://github.com/makeomatic/ms-payments/compare/v8.3.1...v8.4.0) (2020-08-27)


### Features

* new plan titles ([91f228d](https://github.com/makeomatic/ms-payments/commit/91f228d32aa4cdb438a292198ae53722d6de2722))

## [8.3.1](https://github.com/makeomatic/ms-payments/compare/v8.3.0...v8.3.1) (2020-06-10)


### Bug Fixes

* default start/end params for tx sync ([379541e](https://github.com/makeomatic/ms-payments/commit/379541ec3c7372fdf6a6e4cb8aea3d782c417323))

# [8.3.0](https://github.com/makeomatic/ms-payments/compare/v8.2.2...v8.3.0) (2020-06-10)


### Features

* resync pending agreements ([#113](https://github.com/makeomatic/ms-payments/issues/113)) ([ed1bdcc](https://github.com/makeomatic/ms-payments/commit/ed1bdccbe3d5398353e755861a48bfe70710f75b))

## [8.2.2](https://github.com/makeomatic/ms-payments/compare/v8.2.1...v8.2.2) (2020-06-01)


### Bug Fixes

* ignore out of sync cancelled status when we want to cancel ([#112](https://github.com/makeomatic/ms-payments/issues/112)) ([6ccd6ec](https://github.com/makeomatic/ms-payments/commit/6ccd6ec582fbceaa0d3b50628efce01e680c1db0))

## [8.2.1](https://github.com/makeomatic/ms-payments/compare/v8.2.0...v8.2.1) (2020-05-29)


### Bug Fixes

* migration key & goto statement ([e9760b1](https://github.com/makeomatic/ms-payments/commit/e9760b1688a237329ab0b992c7d8b506facf44a6))

# [8.2.0](https://github.com/makeomatic/ms-payments/compare/v8.1.0...v8.2.0) (2020-05-29)


### Features

* track transactions per agreement ([#111](https://github.com/makeomatic/ms-payments/issues/111)) ([3aa5226](https://github.com/makeomatic/ms-payments/commit/3aa52260eafe3f97a8f3778f64342d1143396e5e))

# [8.1.0](https://github.com/makeomatic/ms-payments/compare/v8.0.1...v8.1.0) (2020-05-26)


### Bug Fixes

* ensure we only work with subscription txs ([bac1d79](https://github.com/makeomatic/ms-payments/commit/bac1d79baaa16694e53c87a1b0fd91a641b0896d))
* get-value path ([33859f1](https://github.com/makeomatic/ms-payments/commit/33859f132d9f1b8beff26ee779c571f3580f9211))
* missing params in the query ([953bced](https://github.com/makeomatic/ms-payments/commit/953bcedc8d2c747420dec1ca78cae14f82dc17e4))
* update deps ([0a01573](https://github.com/makeomatic/ms-payments/commit/0a01573718dd3ba1957dbca32281716431cf8266))


### Features

* endpoint to sync Updated txs ([a7c4701](https://github.com/makeomatic/ms-payments/commit/a7c4701776da8fbc2159230e3800d4c7d52fd162))

## [8.0.1](https://github.com/makeomatic/ms-payments/compare/v8.0.0...v8.0.1) (2020-03-19)


### Bug Fixes

* get-value path for arrays ([#110](https://github.com/makeomatic/ms-payments/issues/110)) ([d38f1a3](https://github.com/makeomatic/ms-payments/commit/d38f1a3883ce84f18434e7ca8642cd0931247118))

# [8.0.0](https://github.com/makeomatic/ms-payments/compare/v7.0.4...v8.0.0) (2020-01-26)


### Features

* upgrades all deps, node 12.14.x ([#105](https://github.com/makeomatic/ms-payments/issues/105)) ([3d9c94b](https://github.com/makeomatic/ms-payments/commit/3d9c94beafd927ea07ccf43eb84ee1f6f4c6394f))


### BREAKING CHANGES

* min runtime required is node 12.14.x, configuration changes
in transient dependencies

## [7.0.4](https://github.com/makeomatic/ms-payments/compare/v7.0.3...v7.0.4) (2019-12-11)


### Bug Fixes

* add another log handler to bill ([80e893d](https://github.com/makeomatic/ms-payments/commit/80e893d0103b08a0926fd81bc6b90a2b95a18968))
* cancel suspended plans ([be3004d](https://github.com/makeomatic/ms-payments/commit/be3004d9d89e7cc21e1670181fb49014f825e903))

## [7.0.3](https://github.com/makeomatic/ms-payments/compare/v7.0.2...v7.0.3) (2019-11-28)


### Bug Fixes

* **deps:** @microfleet/transport-amqp, dlock, dev deps ([c7ca6f5](https://github.com/makeomatic/ms-payments/commit/c7ca6f529acdcce89cec4d990b51b547c7a6edd8))

## [7.0.2](https://github.com/makeomatic/ms-payments/compare/v7.0.1...v7.0.2) (2019-11-22)


### Bug Fixes

* **deploy:** remove yarn cache ([04e4818](https://github.com/makeomatic/ms-payments/commit/04e4818660de13710d7e6a138bf0da9236e3f277))

## [7.0.1](https://github.com/makeomatic/ms-payments/compare/v7.0.0...v7.0.1) (2019-11-22)


### Bug Fixes

* gracefully handle out of sync of plan deletes ([89df755](https://github.com/makeomatic/ms-payments/commit/89df755b7f838a44a93d66c9317e77ae68b32f59))

# [7.0.0](https://github.com/makeomatic/ms-payments/compare/v6.3.7...v7.0.0) (2019-11-21)


### Features

* node 12, upgraded deps ([#101](https://github.com/makeomatic/ms-payments/issues/101)) ([a8a4696](https://github.com/makeomatic/ms-payments/commit/a8a469603cf80439e15f0141fed4874f31c9439b))


### BREAKING CHANGES

* uses node 12, slightly change config formats, upgrades all deps with multiple breaking changes

## [6.3.7](https://github.com/makeomatic/ms-payments/compare/v6.3.6...v6.3.7) (2019-08-22)


### Bug Fixes

* access to sale.list via internal dispatch ([d544e98](https://github.com/makeomatic/ms-payments/commit/d544e98))

## [6.3.6](https://github.com/makeomatic/ms-payments/compare/v6.3.5...v6.3.6) (2019-08-22)


### Bug Fixes

* use internal dispatch for validation, update deps ([0d8a0eb](https://github.com/makeomatic/ms-payments/commit/0d8a0eb))

## [6.3.5](https://github.com/makeomatic/ms-payments/compare/v6.3.4...v6.3.5) (2019-08-09)


### Bug Fixes

* capture the actual error ([a5c264b](https://github.com/makeomatic/ms-payments/commit/a5c264b))

## [6.3.4](https://github.com/makeomatic/ms-payments/compare/v6.3.3...v6.3.4) (2019-07-23)


### Bug Fixes

* gracefully handle billing issues ([6b2cb3b](https://github.com/makeomatic/ms-payments/commit/6b2cb3b))
* internal actions, recurring billing ([#95](https://github.com/makeomatic/ms-payments/issues/95)) ([152013b](https://github.com/makeomatic/ms-payments/commit/152013b))
* updated deps ([9edb4fd](https://github.com/makeomatic/ms-payments/commit/9edb4fd))

## [6.3.3](https://github.com/makeomatic/ms-payments/compare/v6.3.2...v6.3.3) (2019-07-18)


### Bug Fixes

* add extra logging for broken agreements ([a1a06c7](https://github.com/makeomatic/ms-payments/commit/a1a06c7))

## [6.3.2](https://github.com/makeomatic/ms-payments/compare/v6.3.1...v6.3.2) (2019-07-17)


### Bug Fixes

* paypal payments use its own config for client ([#94](https://github.com/makeomatic/ms-payments/issues/94)) ([3aad9fd](https://github.com/makeomatic/ms-payments/commit/3aad9fd))

## [6.3.1](https://github.com/makeomatic/ms-payments/compare/v6.3.0...v6.3.1) (2019-07-16)


### Bug Fixes

* update deps ([bc94a08](https://github.com/makeomatic/ms-payments/commit/bc94a08))

# [6.3.0](https://github.com/makeomatic/ms-payments/compare/v6.2.3...v6.3.0) (2019-07-13)


### Features

* paypal sale to authorize-capture ([#93](https://github.com/makeomatic/ms-payments/issues/93)) ([28d3b54](https://github.com/makeomatic/ms-payments/commit/28d3b54))

## [6.2.3](https://github.com/makeomatic/ms-payments/compare/v6.2.2...v6.2.3) (2019-07-09)


### Bug Fixes

* release process improved ([aca98af](https://github.com/makeomatic/ms-payments/commit/aca98af))
