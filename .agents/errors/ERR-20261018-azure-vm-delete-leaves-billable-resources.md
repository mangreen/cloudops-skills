# ERR: Deleting an Azure VM does not delete its disk, NIC, public IP or NSG
Date: 2026-10-18
Severity: Medium

## Description
`az vm delete` removes the VM object only. The OS disk, network interface, public IP and NSG remain and keep billing (disk and static public IP).

## Root Cause
Azure models these as separate resources. (Documented Azure behaviour; **not executed** against a real subscription here.)

## Solution
`cloudops-delete` lists "leaves behind" per resource type, tells the user to delete by explicit resource ID or by a dedicated resource group (after showing its contents), and requires a verify-gone step plus a report of what still bills.

## Prevention
Delete plans always include a "not deleted, still billing" section; after deleting, re-run the tag inventory.
