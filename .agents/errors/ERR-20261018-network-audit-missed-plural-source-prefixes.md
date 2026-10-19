# ERR: NSG exposure audit missed rules that use `sourceAddressPrefixes`
Date: 2026-10-18
Severity: High

## Description
The first version of the Azure audit in `cloudops-network` only inspected the singular `sourceAddressPrefix`. An NSG rule written with the plural list `["10.0.0.0/8", "*"]` — open to the world — was not reported. An exposure audit that misses open rules gives false assurance.

## Root Cause
Incomplete model of the NSG rule schema; found while testing the `jq` against a mock that included a plural-form rule.

## Solution
The filter now checks `[.sourceAddressPrefix] + (.sourceAddressPrefixes // [])` for `*`, `Internet` and `0.0.0.0/0`. Re-tested with open and closed plural cases, an empty NSG, and a Deny rule.

## Prevention
Security audits get mock fixtures covering every field variant (singular/plural, IPv4/IPv6, all-protocol, missing keys) before they ship. TODO: promote the mocks to committed fixtures ([`todo.md`](../../todo.md)).
