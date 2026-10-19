---
name: cloudops-catalog
description: Use when browsing what can be rented or run — regions, machine types, VM sizes, flat-price VPS bundles — or when estimating or comparing prices across AWS, GCP and Azure. Use when user asks "what servers are available", "what does a 2 vCPU / 4 GB VM cost", "cheapest region", "compare AWS vs GCP vs Azure", "有哪些機型", "多少錢", "哪個區域最便宜", or before any create/scale operation that needs a price for confirmation.
---

# CloudOps Catalog — regions, sizes, prices

> **Use only `aws` (v2), `gcloud`, `az`** (plus the providers' public pricing endpoints). READ-class — run freely, but pass the target explicitly. Read `cloudops-core` for the rules on prices.

**Never invent a price.** Every number you show must come from a pricing API response in this session. If you cannot get one, say "estimate unavailable". State what the figure covers: **compute only**; disks, public IPs, load balancers, registries and egress are extra. Monthly ≈ hourly × 730.

## Output format

Normalise to one table so the user can compare:

| Cloud | Region | Type | vCPU | RAM | Linux on-demand USD/hr | ≈ USD/month (730 h) |
|-------|--------|------|------|-----|------------------------|---------------------|

Add one line under it: "Compute only; excludes disk, public IP, egress, taxes. Prices from <API> on <date>."

## Regions

```bash
aws ec2 describe-regions --profile <p> --query 'Regions[].RegionName' --output text
aws ssm get-parameter --region <r> --profile <p> --name /aws/service/global-infrastructure/regions/<r>/longName --query Parameter.Value --output text   # "Asia Pacific (Tokyo)"

gcloud compute regions list --project <id> --format="value(name)"
gcloud compute zones list --project <id> --filter="region:<region>" --format="value(name)"

az account list-locations --query "[?metadata.regionType=='Physical'].{name:name, display:displayName}" -o table
```

Pick a region close to the users, but surface the trade-off if the user didn't specify (latency vs. price vs. data-residency rules). For Taiwan-based users, common choices are `ap-northeast-1` (Tokyo) / `ap-east-2` (Taipei, if enabled) on AWS, `asia-east1` (Taiwan) on GCP, `japaneast` / `eastasia` on Azure — verify each is available to the account before proposing it.

## Machine types

### AWS (EC2)

```bash
# Specs for specific types
aws ec2 describe-instance-types --region <r> --profile <p> --instance-types t3.small t3.medium \
  --query 'InstanceTypes[].{type:InstanceType, vcpu:VCpuInfo.DefaultVCpus, mib:MemoryInfo.SizeInMiB, arch:ProcessorInfo.SupportedArchitectures[0]}' --output table

# Is it actually offered in this region?
aws ec2 describe-instance-type-offerings --region <r> --profile <p> --location-type region \
  --filters Name=instance-type,Values=t3.small --query 'InstanceTypeOfferings[].InstanceType' --output text
```

**Flat-price VPS (closest to "rent a server"):** Lightsail bundles include CPU, RAM, disk and transfer for one monthly price.

```bash
aws lightsail get-regions --include-availability-zones --region <r> --profile <p> --query 'regions[].{name:name, azs:availabilityZones[].zoneName}'
aws lightsail get-blueprints --region <r> --profile <p> --query "blueprints[?type=='os'].{id:blueprintId, name:name}" --output table
aws lightsail get-bundles --region <r> --profile <p> \
  --query 'bundles[].{id:bundleId, vcpu:cpuCount, ramGb:ramSizeInGb, diskGb:diskSizeInGb, usdMonth:price, transferGb:transferPerMonthInGb}' --output table
```

### GCP (Compute Engine)

```bash
gcloud compute machine-types list --project <id> --zones <zone> \
  --filter="name~'^e2-(micro|small|medium|standard-2)$'" --format="table(name,guestCpus,memoryMb)"
```

### Azure (VMs)

```bash
az vm list-sizes --subscription <id> --location <loc> -o table                         # cores, memory
az vm list-skus  --subscription <id> --location <loc> --resource-type virtualMachines --size Standard_B -o table   # what THIS subscription can actually deploy; check the Restrictions column
```

A size that appears in `list-sizes` can still be blocked for the subscription (`NotAvailableForSubscription`) — `list-skus` shows restrictions.

## Prices

### AWS — Price List API (endpoint exists only in `us-east-1`, `ap-south-1`, `eu-central-1`)

The price API filters by the region's **long name**, not its code (use the SSM lookup above).

```bash
LOC="Asia Pacific (Tokyo)"       # from the SSM longName lookup
aws pricing get-products --region us-east-1 --profile <p> --service-code AmazonEC2 --max-items 1 \
  --filters "Type=TERM_MATCH,Field=instanceType,Value=t3.small" \
            "Type=TERM_MATCH,Field=location,Value=$LOC" \
            "Type=TERM_MATCH,Field=operatingSystem,Value=Linux" \
            "Type=TERM_MATCH,Field=tenancy,Value=Shared" \
            "Type=TERM_MATCH,Field=preInstalledSw,Value=NA" \
            "Type=TERM_MATCH,Field=capacitystatus,Value=Used" \
  --output json | jq -r '.PriceList[0] | fromjson | .terms.OnDemand | to_entries[0].value.priceDimensions | to_entries[0].value.pricePerUnit.USD'
```

`PriceList` entries are JSON **strings** (hence `fromjson`). Empty result = a filter didn't match; re-check the long name and `operatingSystem`. AWS also bills **public IPv4 addresses hourly** — mention it for any VM with a public IP. Lightsail bundle prices come straight from `get-bundles`.

### Azure — public Retail Prices API (no auth)

```bash
curl -sS -G "https://prices.azure.com/api/retail/prices" \
  --data-urlencode "\$filter=serviceName eq 'Virtual Machines' and armRegionName eq '<loc>' and armSkuName eq 'Standard_B2s' and priceType eq 'Consumption'" \
| jq -r '.Items[] | select(.unitOfMeasure=="1 Hour")
         | select((.productName + " " + .skuName) | test("Windows|Spot|Low Priority") | not)
         | "\(.armSkuName)\t\(.retailPrice) \(.currencyCode)/hr\t\(.productName)"'
```

The filter removes Windows, Spot and Low-Priority rows so you quote the Linux on-demand price. Follow `NextPageLink` if the result is paged.

### GCP — Cloud Billing Catalog API (best-effort)

GCP has no CLI command for list prices, and VM cost is **vCPU-hours + GB-hours priced separately**, so it is easy to get wrong. See `references/gcp-vm-pricing.md` for a tested derivation. If you cannot derive both the core and RAM SKUs for the machine family and region, **say "estimate unavailable"** and point the user to the Google Cloud Pricing Calculator. Shared-core types (`e2-micro/small/medium`) and custom machine types are priced differently — don't apply the standard formula to them.

## When you only need a rough comparison

Present 2–3 candidates that meet the stated need (vCPU/RAM/region) with real prices, call out the cheapest *and* the sensible default, and ask which to proceed with. Don't enumerate every size.
