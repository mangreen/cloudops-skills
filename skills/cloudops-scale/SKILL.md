---
name: cloudops-scale
description: Use when scaling capacity up or down — replicas, instances, task size, min/max autoscaling bounds, Kubernetes node pools — on AWS (ECS Express Mode, EKS), GCP (Cloud Run, GKE) or Azure (Container Apps, AKS). Use when user says "scale up", "add more instances", "handle more traffic", "set min instances", "scale down to save money", "add nodes", "擴容", "縮容", "加節點", "調高上限". Scaling up changes the bill — requires priced confirmation. For a bigger single VM use cloudops-server-manage.
---

# CloudOps Scale

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Scaling **up** is **SPEND**; scaling **down** is **CHANGE** (but can cause an outage if capacity is too small). Always pass the target explicitly.

## Workflow

1. **Show current state first** (READ): current min/max/desired, task/instance size, and recent load (`cloudops-metrics`). Scaling without looking at the numbers is guessing.
2. **Propose a concrete change** — exact before → after values and the reason.
3. **Price the change** (see `cloudops-catalog`; never invent numbers) and what *always-on* capacity costs. Say plainly what it does to the monthly bill, including the worst case at the new **max**.
4. **Confirm** (SPEND template in `cloudops-core`). Scale-down: confirm if production.
5. **Apply, then watch** with a bounded wait until the new state is actually reached; report the result and the new cost estimate.

**The maximum is a spend cap.** An unbounded autoscaler plus a traffic spike (or an attack) is an unbounded bill. Always set a sensible `max`, and say what it is.

## Container services

| | min / max replicas | task/instance size |
|---|---|---|
| **GCP Cloud Run** | `gcloud run services update <n> --project <id> --region <r> --min-instances 1 --max-instances 20` | `--cpu 2 --memory 1Gi`, `--concurrency 80` |
| **Azure Container Apps** | `az containerapp update --subscription <id> -g <rg> -n <n> --min-replicas 1 --max-replicas 10` | `--cpu 0.5 --memory 1.0Gi` (CPU/memory must be a valid pair) |
| **AWS ECS Express** | `aws ecs update-express-gateway-service … --service-arn <arn> --scaling-target '{"minTaskCount":2,"maxTaskCount":10}'` | `--cpu 512 --memory 1024` (CPU units / MiB; valid Fargate pairs) |

```bash
# AWS example (target flags: --profile <p> --region <r>)
aws ecs update-express-gateway-service --profile <p> --region <r> --service-arn <arn> \
  --scaling-target '{"minTaskCount":2,"maxTaskCount":10}'
```

Notes:

- **Min > 0 bills continuously** (Cloud Run min-instances, Container Apps min-replicas, ECS tasks). Min 0 = scale to zero and accept cold starts (Express Mode has no scale-to-zero: its floor is one task).
- Changing task size/replica settings creates a **new revision/deployment** (a rollout). It's usually zero-downtime for web services but confirm for production.
- Autoscaling metric tuning: Cloud Run `--concurrency`; Container Apps scale rules (`--scale-rule-name`, HTTP concurrency); ECS Express `scalingTarget.autoScalingMetric` / `autoScalingTargetValue` (default metric CPU at a target of 60).
- Check account **quotas** if scaling a lot (Fargate vCPUs, Cloud Run instances, regional cores) — see `cloudops-troubleshoot`.

Wait for convergence the same way as a deploy — `cloudops-deploy` references have the loops; for Cloud Run `gcloud run services describe … --format="value(status.conditions[0].status)"`; for Container Apps `az containerapp revision list … --query "[?properties.active].{name:name,state:properties.runningState}"`.

## Kubernetes node pools

Only for users who already have a cluster. Adding nodes bills immediately; the price follows the underlying machines.

```bash
# AWS EKS managed node group
aws eks update-nodegroup-config --profile <p> --region <r> --cluster-name <c> --nodegroup-name <g> \
  --scaling-config minSize=1,maxSize=5,desiredSize=3
aws eks describe-nodegroup --profile <p> --region <r> --cluster-name <c> --nodegroup-name <g> --query 'nodegroup.{status:status,scaling:scalingConfig}'

# GCP GKE
gcloud container clusters resize <cluster> --project <id> --region <r> --node-pool <pool> --num-nodes 3 --quiet   # --quiet only after confirmation
# Azure AKS
az aks nodepool scale --subscription <id> -g <rg> --cluster-name <c> -n <pool> --node-count 3
```

- **GKE regional clusters:** `--num-nodes` is **per zone**. `3` in a 3-zone regional cluster = 9 nodes. Say the real total in the confirmation.
- If the pool has the **cluster autoscaler** enabled, a manual node count fights it — change min/max instead (`gcloud container node-pools update … --min-nodes/--max-nodes`, `az aks nodepool update …`, EKS `scaling-config`).
- **Scaling down** drains nodes and reschedules pods onto the rest. Check the remaining capacity fits current workloads (`kubectl top nodes` if available, or `cloudops-metrics`). Never scale the only pool to 0.
- Poll with a deadline (~15 min). Stop and report if the pool shows a failed/degraded status; on success report the new node count and estimated price.

## Single VMs and instance groups

Bigger VM → `cloudops-server-manage` (resize, needs downtime). AWS Auto Scaling groups: `aws autoscaling update-auto-scaling-group --auto-scaling-group-name <n> --min-size 2 --max-size 6 --desired-capacity 3`; GCP managed instance groups: `gcloud compute instance-groups managed resize <n> --size 3 --zone <z>`; Azure scale sets: `az vmss scale -g <rg> -n <n> --new-capacity 3`. Same rules: price it, confirm, watch.

## Never blind-retry

If a scale call times out at the transport layer, **read the current state first** — the change may have been applied. Retrying `add node pool`-style operations can double-provision and double-bill.
