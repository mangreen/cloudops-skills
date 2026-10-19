# ERR: `az vm create` opens SSH to the whole internet by default
Date: 2026-10-18
Severity: High

## Description
On Linux, `az vm create` creates an NSG rule allowing SSH (22) from any source unless told otherwise. A new VM is reachable by password-guessing bots within minutes.

## Root Cause
Verified in `az vm create --help`: `--nsg-rule` "defaults to open ports for allowing … SSH on Linux. NONE represents no NSG rule" (allowed values `NONE`, `RDP`, `SSH`).

## Solution
`cloudops-server-rent` always passes `--nsg-rule NONE`, then adds an inbound rule limited to the user's `/32` (`az network nsg rule create … --source-address-prefixes <ip>/32`). `cloudops-network` can audit existing NSGs for world-open rules.

## Prevention
For every "create a thing with network exposure" command, read the default exposure in the help text and state it. EXPOSE class requires a "who can reach what" confirmation ([MEM-0003](../memories/MEM-0003-safety-and-confirmation-rules.md)).
