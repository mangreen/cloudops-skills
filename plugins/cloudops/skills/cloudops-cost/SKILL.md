---
name: cloudops-cost
description: Use when looking at cloud spend — "how much am I spending", "show my bill", "which service costs the most", "find wasted resources", "idle disks / unused IPs", "set a budget alert", "帳單", "這個月花多少", "有沒有浪費", "設定預算". On AWS (Cost Explorer, Budgets), GCP (billing export, budgets) and Azure (Cost Management). Reports are READ; creating a budget alert is a small CHANGE. Does not delete anything — use cloudops-delete.
---

# CloudOps Cost

> **Use only `aws` (v2), `gcloud`, `az`** (plus `bq` where GCP billing export exists). Read `cloudops-core` first. Reports are READ-class. Be honest about data freshness and coverage.

**Cost data lags** by hours to a day and may be incomplete for the current day. Say so with every number, and never present a forecast as a bill.

## 1. "What am I spending?" (READ)

Month-to-date by service, top ten. Use the same window on every cloud and show the currency.

### AWS — Cost Explorer

Cost Explorer is a global endpoint served from `us-east-1` (always pass `--region us-east-1`). Each API request costs about US$0.01 — fine for a report, not for loops.

```bash
START=$(date -u +%Y-%m-01); END=$(date -u -d '+1 day' +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)   # End is exclusive
aws ce get-cost-and-usage --profile <p> --region us-east-1 \
  --time-period Start=$START,End=$END --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE --output json \
| jq -r '.ResultsByTime[] | .Groups | map({service:.Keys[0], usd:(.Metrics.UnblendedCost.Amount|tonumber)}) | sort_by(-.usd) | .[] | select(.usd>0) | "\(.usd*100|round/100)\t\(.service)"' | head -10
```

Only what **this agent** created: add `--filter '{"Tags":{"Key":"managed_by","Values":["cloudops_agent"]}}'`. Tags only appear in cost data after they're **activated as cost allocation tags** (Billing console) and only for usage after activation — if the result is empty, say that rather than "no cost". Cost Explorer must be enabled on the account.

### Azure — Cost Management (no extension needed, via `az rest`)

```bash
SUB=<subscription-id>
cat > /tmp/cost-query.json <<'EOF'
{"type":"ActualCost","timeframe":"MonthToDate",
 "dataset":{"granularity":"None","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},
            "grouping":[{"type":"Dimension","name":"ServiceName"}]}}
EOF
az rest --method post \
  --url "https://management.azure.com/subscriptions/$SUB/providers/Microsoft.CostManagement/query?api-version=2023-11-01" \
  --body @/tmp/cost-query.json \
| jq -r '.properties as $p | $p.rows | sort_by(-.[0]) | .[:10][] | "\(.[0]*100|round/100)\t\(.[1])\t\(.[2])"'
```

The column order is `Cost, ServiceName, Currency` for this query — print `.properties.columns` if you change it. Requests are rate-limited; don't poll. Requires at least *Cost Management Reader*.

### GCP — Cloud Billing

There is **no `gcloud` command that returns spend**. Real numbers need the **billing export to BigQuery**. Check whether one exists:

```bash
gcloud billing projects describe <project-id> --format="value(billingAccountName)"
bq ls --project_id=<export-project> <dataset> 2>/dev/null | grep gcp_billing_export     # table name: gcp_billing_export_v1_<BILLING_ACCOUNT_ID>
```

If it exists (replace the table and period):

```bash
bq query --use_legacy_sql=false --format=pretty \
'SELECT service.description AS service, ROUND(SUM(cost),2) AS cost, currency
 FROM `<export-project>.<dataset>.gcp_billing_export_v1_<ID>`
 WHERE usage_start_time >= TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), MONTH))
 GROUP BY service, currency ORDER BY cost DESC LIMIT 10'
```

Queries scan data and can cost money on large exports; keep the window tight. **If there is no export, say so**: point the user to *Billing → Reports* in the console, and offer to help enable the export (it only collects data from the moment it is switched on — no history). Never estimate GCP spend from resource lists and present it as the bill.

## 2. Find waste (READ — then ask before deleting anything)

Idle resources that still bill:

```bash
# AWS — unattached volumes, unassociated Elastic IPs, stopped instances (their disks still bill)
aws ec2 describe-volumes --profile <p> --region <r> --filters Name=status,Values=available --query 'Volumes[].{id:VolumeId,gb:Size,type:VolumeType,created:CreateTime}' --output table
aws ec2 describe-addresses --profile <p> --region <r> --query 'Addresses[?AssociationId==null].{ip:PublicIp,alloc:AllocationId}' --output table
aws ec2 describe-instances --profile <p> --region <r> --filters Name=instance-state-name,Values=stopped --query 'Reservations[].Instances[].{id:InstanceId,type:InstanceType}' --output table

# GCP
gcloud compute disks list --project <id> --filter="-users:*" --format="table(name,zone.basename(),sizeGb,type.basename())"
gcloud compute addresses list --project <id> --filter="status=RESERVED" --format="table(name,region.basename(),address)"
gcloud compute instances list --project <id> --filter="status=TERMINATED" --format="table(name,zone.basename(),machineType.basename())"

# Azure
az disk list --subscription <id> --query "[?managedBy==null].{name:name,rg:resourceGroup,gb:diskSizeGb,sku:sku.name}" -o table
az network public-ip list --subscription <id> --query "[?ipConfiguration==null].{name:name,rg:resourceGroup}" -o table
az vm list --subscription <id> -d --query "[?powerState=='VM deallocated'].{name:name,rg:resourceGroup}" -o table
```

Also look for: databases and load balancers with no traffic (`cloudops-metrics`), over-provisioned always-on capacity (min instances), forgotten dev environments, old snapshots. Present them as **candidates with a reason**, grouped by `managed_by=cloudops_agent` (ours) vs. not (someone else's — don't suggest deleting those without the owner). Offer `cloudops-delete` for the ones the user approves. Do not estimate savings you can't back with a price.

## 3. Budget alerts (CHANGE — notifications only)

A budget **alerts**, it does not **stop** spending. Say that. Ask for the amount, the period, and where to send alerts.

### AWS Budgets

```bash
ACCT=$(aws sts get-caller-identity --profile <p> --query Account --output text)
cat > /tmp/budget.json <<'EOF'
{"BudgetName":"agent-monthly-budget","BudgetLimit":{"Amount":"50","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}
EOF
cat > /tmp/budget-notify.json <<'EOF'
[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},
  "Subscribers":[{"SubscriptionType":"EMAIL","Address":"<email>"}]}]
EOF
aws budgets create-budget --profile <p> --account-id "$ACCT" --budget file:///tmp/budget.json --notifications-with-subscribers file:///tmp/budget-notify.json
```

### GCP

```bash
gcloud billing budgets create --billing-account=<ID> --display-name="agent-monthly-budget" \
  --budget-amount=50USD --threshold-rule=percent=0.8 --threshold-rule=percent=1.0
```

Creating budgets needs billing-account permissions (often not held by project owners) — report a permission error rather than working around it. Email recipients are configured on the budget's notification channels (console) unless you pass `--notifications-rule-pubsub-topic`.

### Azure

Budgets with email alerts need a notifications block that the simple CLI doesn't express; use the portal (*Cost Management → Budgets*) or an ARM/`az rest` call that you and the user have reviewed. Don't improvise this one.

## Report format

A short table (service, cost), the period and currency, the data-freshness caveat, then 2–3 concrete observations ("RDS is 70 % of spend; the `orders-db` instance runs 24/7 on a class larger than its CPU needs — see `cloudops-metrics`"). Don't dump raw API output.
