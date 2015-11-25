# Microservice for handling PayPal payments over AMQP transport layer

## Installation

`npm i ms-payments -S`

## Overview

Starts horizontally scalable nodejs worker communicating over amqp layer with redis cluster backend.
Supports a broad range of operations for working with payments. Please refer to the configuration options for now,
that contains description of routes and their capabilities.

## Roadmap

1. Add Redis caching
 - [ ] cache plans
 - [ ] cache agreements
 - [ ] link users to agreements
