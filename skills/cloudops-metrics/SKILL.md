---
name: cloudops-metrics
description: Use when checking resource usage or service health numbers — CPU, memory, request rate, error rate, latency, replica/instance counts — on AWS (CloudWatch), GCP (Cloud Monitoring) or Azure (Azure Monitor). Use when user says "how is the CPU", "is it under load", "show metrics", "is memory growing", "請求量", "CPU 使用率", "有沒有爆記憶體", or before deciding whether to scale. READ-only.
---

# CloudOps Metrics

> **Use only `aws` (v2), `gcloud`, `az`** (GCP time-series has no `gcloud` command, so it uses `curl` with the CLI's token). READ-class. Read `cloudops-core` first.

## Workflow

1. Identify the resource and a **time window** (default: last hour, 5-minute resolution; widen to 24 h for trends).
2. Pull the **four golden signals** that apply: **traffic** (requests/s), **errors** (5xx rate), **latency** (p50/p99), **saturation** (CPU, memory, instance count vs. limits).
3. Report min / avg / max / trend and compare to the configured **limits** (task size, max instances) — a number means little without its ceiling.
4. Recommend, don't act: scaling is `cloudops-scale` (and SPEND).

Portable timestamps (GNU first, macOS fallback):

```bash
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START=$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
```

## AWS — CloudWatch

```bash
# ECS / ECS Express Mode service CPU (use MemoryUtilization for memory)
aws cloudwatch get-metric-statistics --profile <p> --region <r> \
  --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=<cluster> Name=ServiceName,Value=<service-name> \
  --start-time "$START" --end-time "$END" --period 300 --statistics Average Maximum \
  --query 'sort_by(Datapoints,&Timestamp)[].{t:Timestamp,avg:Average,max:Maximum}' --output table

# EC2 CPU
aws cloudwatch get-metric-statistics --profile <p> --region <r> \
  --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value=<i-id> \
  --start-time "$START" --end-time "$END" --period 300 --statistics Average Maximum \
  --query 'sort_by(Datapoints,&Timestamp)[].{t:Timestamp,avg:Average,max:Maximum}' --output table
```

- Empty output ≠ zero: wrong namespace/dimension names return nothing. Discover what exists: `aws cloudwatch list-metrics --namespace AWS/ECS --dimensions Name=ServiceName,Value=<service-name>`.
- **EC2 has no memory or disk metrics** unless the CloudWatch agent is installed — say so rather than reporting "N/A = fine"; use `cloudops-server-exec` (`free -m`, `df -h`).
- Load balancer errors/latency: namespace `AWS/ApplicationELB`, metrics `HTTPCode_Target_5XX_Count`, `TargetResponseTime`, `RequestCount`, dimension `LoadBalancer=<app/…suffix>` from `aws elbv2 describe-load-balancers`.

## GCP — Cloud Monitoring (REST)

Keep the token out of the process list with a `0600` curl config. Run the whole block together (each tool call is a fresh shell):

```bash
CFG=$(mktemp); chmod 600 "$CFG"; trap 'rm -f "$CFG"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$(gcloud auth print-access-token)" > "$CFG"

curl -sS -K "$CFG" -G "https://monitoring.googleapis.com/v3/projects/<project-id>/timeSeries" \
  --data-urlencode 'filter=metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="<name>"' \
  --data-urlencode "interval.startTime=$START" --data-urlencode "interval.endTime=$END" \
  --data-urlencode "aggregation.alignmentPeriod=300s" --data-urlencode "aggregation.perSeriesAligner=ALIGN_RATE" \
  --data-urlencode "aggregation.crossSeriesReducer=REDUCE_SUM" --data-urlencode "aggregation.groupByFields=metric.label.response_code_class" \
| jq -c '.timeSeries[]? | {labels:.metric.labels, points:[.points[] | {t:.interval.endTime, v:(.value.doubleValue // (.value.int64Value|tonumber?))}]}'
```

An HTTP error body (for example `403 … API not enabled`, or a quota-project request) is not an empty result — read it. If needed enable `monitoring.googleapis.com` (CHANGE, free) or add `-H "x-goog-user-project: <project-id>"`.

Useful metric types:

| What | `metric.type` | Aligner |
|------|---------------|---------|
| Cloud Run requests | `run.googleapis.com/request_count` (label `response_code_class`) | `ALIGN_RATE` |
| Cloud Run latency | `run.googleapis.com/request_latencies` | `ALIGN_PERCENTILE_99` (or `_50`) |
| Cloud Run CPU / memory | `run.googleapis.com/container/cpu/utilizations`, `…/memory/utilizations` | `ALIGN_PERCENTILE_99` |
| Cloud Run instances | `run.googleapis.com/container/instance_count` | `ALIGN_MEAN` |
| VM CPU | `compute.googleapis.com/instance/cpu/utilization` (`resource.type="gce_instance"`, `resource.labels.instance_id`) | `ALIGN_MEAN` |

Distribution metrics (latency, utilizations) need a percentile/mean aligner or the API returns distribution objects — for those drop `crossSeriesReducer` and read `.value.distributionValue` or switch the aligner. VM memory needs the Ops Agent.

## Azure — Azure Monitor

Metric names differ per resource type, so **list the definitions first**:

```bash
RID=$(az containerapp show --subscription <id> -g <rg> -n <name> --query id -o tsv)
az monitor metrics list-definitions --resource "$RID" --query "[].{name:name.value, unit:unit}" -o table

az monitor metrics list --resource "$RID" --metric Requests --interval PT5M --offset 1h --aggregation Total -o table
az monitor metrics list --resource "$RID" --metric UsageNanoCores --interval PT5M --offset 1h --aggregation Average Maximum -o table
```

VM: `RID=$(az vm show -g <rg> -n <name> --query id -o tsv)` and metric `"Percentage CPU"` (quote it). Guest memory needs the Azure Monitor agent.

## Reading the numbers

| Signal | Worry when | Suggests |
|--------|-----------|----------|
| CPU | sustained > ~80% of the limit | scale out/up (`cloudops-scale`) |
| Memory | steady climb toward the limit, or restarts / exit code 137 | leak or too-small limit → raise memory, find the leak |
| 5xx rate | non-zero and rising after a deploy | roll back (`cloudops-restart-rollback`), read logs |
| p99 latency | rising while CPU is low | a dependency (database, external API) is slow |
| Instances at the max | pinned at `max` while CPU high | the ceiling is the bottleneck |
| Instances at zero, latency spikes on first request | cold starts | consider min instances (costs money) |

State the window and resolution you used, and never extrapolate beyond what the data shows.
