# ERR: Deploy verification loop printed nothing when every attempt failed
Date: 2026-10-18
Severity: Medium

## Description
The post-deploy check retried `curl` six times and `break`-ed on success, but printed nothing on failure. An agent reading empty output could treat "no PASS" as "fine" and report a broken deploy as successful.

## Root Cause
Success path was explicit, failure path was the absence of output. Found by running the loop against local servers returning 200, 403, 503 and a closed port.

## Solution
The loop sets `OK=1` on success and ends with `HEALTHY` / `NOT HEALTHY after retries`. Re-tested on 200 and 502 servers. A 403 from a deliberately private service counts as healthy.

## Prevention
Every verification step must produce an explicit pass **and** an explicit fail line.
