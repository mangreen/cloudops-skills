# Deploy on AWS — Amazon ECS Express Mode

ECS Express Mode takes **a container image and two IAM roles** and provisions an ECS service on Fargate behind an Application Load Balancer with auto-scaling and a public HTTPS endpoint. It is AWS's recommended path for new App Runner-style workloads — **AWS App Runner has been closed to new customers since 2026-04-30** (existing customers can keep using it).

Facts that shape the plan:

- **Images only.** No source-to-container build. You build and push an image (ECR) first.
- **Does not scale to zero.** At least one Fargate task runs; there is a load balancer (shared across up to 25 Express services). It has a monthly floor, unlike Cloud Run / Container Apps.
- Express Mode itself adds no charge; you pay for the resources it creates (Fargate tasks, ALB, data transfer, CloudWatch Logs, ECR storage).
- API/CLI: `aws ecs create-express-gateway-service`, `update-…`, `describe-…`, `delete-…`. Requires AWS CLI v2.
- Existing App Runner customers (check: `aws apprunner list-services`) may keep using App Runner, but don't start new services there.

Variables used below: `P` = profile, `R` = region, `NAME` = service name, `ACCT` = account ID.

```bash
ACCT=$(aws sts get-caller-identity --profile $P --query Account --output text)
```

## 1. Does the service already exist? (READ)

```bash
aws ecs list-services --profile $P --region $R --cluster default --output json \
  | jq -r --arg n "$NAME" '.serviceArns[] | select(endswith("/" + $n))'
```

A hit means **redeploy** (section 6), not create. `ClusterNotFoundException` just means nothing has been created in the `default` cluster yet.

## 2. The two IAM roles (IAM class — check, then confirm before creating)

```bash
aws iam get-role --profile $P --role-name ecsTaskExecutionRole --query Role.Arn --output text
aws iam get-role --profile $P --role-name ecsInfrastructureRoleForExpressServices --query Role.Arn --output text
```

`NoSuchEntity` → they don't exist. Creating roles is an IAM change: tell the user exactly what you will create, then (after confirmation):

```bash
aws iam create-role --profile $P --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam create-role --profile $P --role-name ecsInfrastructureRoleForExpressServices \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Sid":"AllowAccessInfrastructureForECSExpressServices","Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --profile $P --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam attach-role-policy --profile $P --role-name ecsInfrastructureRoleForExpressServices \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
```

These use AWS-managed policies only. The **user's** identity also needs `iam:PassRole` for both roles; a `not authorized to perform: iam:PassRole` error means it's missing — report it, don't grant it yourself.

If the app reads secrets/other AWS services at runtime it needs a **task role** (`--task-role-arn`); that's a separate, narrower role — ask what it needs.

## 3. Build and push the image to ECR

```bash
REPO=$NAME; TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
IMAGE="$ACCT.dkr.ecr.$R.amazonaws.com/$REPO:$TAG"

aws ecr describe-repositories --profile $P --region $R --repository-names $REPO >/dev/null 2>&1 || \
  aws ecr create-repository --profile $P --region $R --repository-name $REPO \
    --image-scanning-configuration scanOnPush=true --tags Key=managed_by,Value=cloudops_agent

aws ecr get-login-password --profile $P --region $R | docker login --username AWS --password-stdin "$ACCT.dkr.ecr.$R.amazonaws.com"
docker build --platform linux/amd64 -t "$IMAGE" . && docker push "$IMAGE"
```

`--platform linux/amd64` matters on Apple Silicon: an arm64 image on an x86 Fargate task dies with `exec format error`. Tag by git SHA/version, **not only `latest`**, so rollback has something to return to. If the user supplied an existing image (Docker Hub, ECR public), skip this step; private registries other than ECR need `repositoryCredentials`.

## 4. Create the service (after confirmation)

`cpu` is in **CPU units** (256 = 0.25 vCPU) and `memory` in **MiB** per the ECS API. Use valid Fargate pairs (256/512, 512/1024, 1024/2048, 2048/4096, 4096/8192). *(AWS's getting-started page shows `--cpu 2 --memory 4`, which conflicts with the API definition — so always verify the result with `describe` in step 5.)*

```bash
EXEC=arn:aws:iam::$ACCT:role/ecsTaskExecutionRole
INFRA=arn:aws:iam::$ACCT:role/ecsInfrastructureRoleForExpressServices

ARN=$(aws ecs create-express-gateway-service --profile $P --region $R \
  --service-name "$NAME" \
  --execution-role-arn "$EXEC" --infrastructure-role-arn "$INFRA" \
  --primary-container "{\"image\":\"$IMAGE\",\"containerPort\":8080}" \
  --cpu 256 --memory 512 \
  --health-check-path /health \
  --scaling-target '{"minTaskCount":1,"maxTaskCount":2}' \
  --tags key=managed_by,value=cloudops_agent \
  --query 'service.serviceArn' --output text)
echo "$ARN"
```

- `containerPort` is the port the app listens on. Default health-check path is `/ping`; set `--health-check-path` to a path that returns **HTTP 200**.
- Env vars/secrets: add `"environment":[{"name":"K","value":"V"}]` / `"secrets":[{"name":"K","valueFrom":"<secretsmanager-or-ssm-arn>"}]` inside `--primary-container`. Never put secret values in `environment`; see `cloudops-config`.
- No default VPC? Add `--network-configuration '{"subnets":["subnet-…"],"securityGroups":["sg-…"]}'` — ask the user which.
- `--service-name` cannot be changed later. Without `--cluster` the `default` cluster is used.
- If creation fails up front, nothing was created; if it times out at the transport layer, **list services (step 1) before retrying**.

## 5. Wait until it is actually healthy, then get the URL

`statusCode` is only `ACTIVE | DRAINING | INACTIVE` and `ACTIVE` can appear before tasks are healthy, so also check the underlying ECS rollout. Bounded wait, stops at the first failure:

```bash
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

DEADLINE=$(( $(date +%s) + 900 ))          # real 15-minute deadline
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  DESC=$(aws ecs describe-express-gateway-service --profile "$P" --region "$R" --service-arn "$ARN" --output json) || exit 1
  CODE=$(printf '%s' "$DESC" | jq -r '.service.status.statusCode // "UNKNOWN"')
  CLUSTER=$(printf '%s' "$DESC" | jq -r '.service.cluster // "default"')

  SVC=$(aws ecs describe-services --profile "$P" --region "$R" --cluster "$CLUSTER" --services "$ARN" --output json) || exit 1
  ROLLOUT=$(printf '%s' "$SVC" | jq -r '[.services[0].deployments[]? | select(.status=="PRIMARY")][0].rolloutState // "UNKNOWN"')
  RUNNING=$(printf '%s' "$SVC" | jq -r '.services[0].runningCount // 0')
  DESIRED=$(printf '%s' "$SVC" | jq -r '.services[0].desiredCount // 0')
  echo "status=$CODE rollout=$ROLLOUT running=$RUNNING/$DESIRED"

  if [ "$ROLLOUT" = "FAILED" ]; then
    printf '%s' "$SVC" | jq -r '[.services[0].deployments[]? | select(.status=="PRIMARY")][0].rolloutStateReason // "no reason given"' >&2
    exit 1
  fi
  if [ "$CODE" = "ACTIVE" ] && [ "$ROLLOUT" = "COMPLETED" ] && [ "$RUNNING" -ge 1 ] && [ "$RUNNING" -eq "$DESIRED" ]; then
    printf '%s' "$DESC" | jq -r '.service.activeConfigurations[0].ingressPaths[]? | select(.accessType=="PUBLIC") | .endpoint'
    exit 0
  fi
  sleep 20
done
echo "Not healthy after 15 minutes — report current state, do not keep waiting" >&2
exit 2
```

Each tool call is a fresh shell — keep `P`, `R`, `ARN` in the same block (or re-set them). The first create can take several minutes while the load balancer is provisioned. On `FAILED`, go to `cloudops-logs` + `cloudops-troubleshoot` (health-check path/port are the usual cause). The printed endpoint is HTTPS; verify with `curl` as in the main skill. Also confirm the sizes landed as intended:

```bash
aws ecs describe-express-gateway-service --profile $P --region $R --service-arn "$ARN" \
  --query 'service.activeConfigurations[0].{cpu:cpu,memory:memory,port:primaryContainer.containerPort,health:healthCheckPath,scaling:scalingTarget}'
```

## 6. Redeploy a new version

`update-express-gateway-service` takes the **whole** `primaryContainer` block. Sending only `image` would drop your environment variables and secrets. Always read the current block, change one field, send it all back:

```bash
CUR=$(aws ecs describe-express-gateway-service --profile $P --region $R --service-arn "$ARN" \
        --query 'service.activeConfigurations[0].primaryContainer' --output json)
NEW=$(printf '%s' "$CUR" | jq --arg img "$IMAGE" '.image = $img')
aws ecs update-express-gateway-service --profile $P --region $R --service-arn "$ARN" --primary-container "$NEW"
```

Then run the wait loop from step 5. Remember the previous image tag — that is the rollback target (`cloudops-restart-rollback`).

## 7. Custom domain, scaling, config, delete

- Custom domain + HTTPS needs an ACM certificate and DNS records → `cloudops-domain-dns`. A bare CNAME to the Express endpoint will **not** serve valid HTTPS for another hostname.
- Min/max tasks, task size → `cloudops-scale`.
- Env vars and secrets → `cloudops-config`.
- Delete → `cloudops-delete` (`aws ecs delete-express-gateway-service`); the ECR repository, log group and IAM roles are separate and stay behind unless removed.

## What bills

Fargate vCPU/memory per running task-hour, the Application Load Balancer (hourly + LCU; shared), data transfer, CloudWatch Logs ingestion/storage, ECR storage. For a figure, look up Fargate (`--service-code AmazonECS`) and load balancer (`--service-code AWSELB`) prices with `aws pricing get-products` — if you can't, say "estimate unavailable".
