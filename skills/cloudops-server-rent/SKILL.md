---
name: cloudops-server-rent
description: Use when renting, creating, provisioning or spinning up a new server / VM / VPS on AWS (EC2 or Lightsail), Google Cloud (Compute Engine) or Azure (Virtual Machines). Use when user says "rent a server", "create a VM", "spin up an instance", "I need a Linux box", "開一台主機", "租伺服器", "幫我建一台 VM". Creates billable resources — requires explicit priced confirmation.
---

# CloudOps Server Rent

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. This is **SPEND + EXPOSE** class: you are the last line of defense against a surprise bill and an SSH port open to the world.

Renting gives the user **a plain Linux machine and SSH access — nothing else**. It does not deploy an app. If they want an app running, use `cloudops-deploy` (managed containers) or `cloudops-server-exec` after renting.

## Ask first (one message, only what is missing)

1. **Cloud and region** (default to what `cloudops-auth` shows; suggest a region close to the users).
2. **Size** — purpose or vCPU/RAM. Use `cloudops-catalog` for real prices; propose 2–3 options.
3. **OS** — default Ubuntu LTS unless told otherwise.
4. **How to reach it** — SSH from the user's current IP (default), or no inbound SSH (AWS SSM Session Manager / GCP IAP). Never default to "open to everyone".

## Preflight (READ)

- `cloudops-auth` context check; print the context line.
- Confirm the account can create it: billing enabled (GCP), provider registered (Azure), quota (see `cloudops-troubleshoot`).
- **Look for an existing server with the same name** before creating (idempotency).
- SSH public key: check `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`). If none, ask before generating one (`ssh-keygen -t ed25519`). **Import the user's public key; never create a keypair whose private half you'd have to print.**
- Admin IP for the firewall: `curl -s https://checkip.amazonaws.com` (an external call — say so), then use `<ip>/32`. If the user is behind CGNAT or a VPN whose address changes, tell them the rule may need updating.

## ⚠️ Confirm before creating (REQUIRED)

Present in one message: cloud/account/region, exact size and OS, disk size, **estimated monthly compute cost and what it excludes**, **what keeps billing while stopped** (disk, public IP), who can reach SSH, and the tag `managed_by=cloudops_agent`. Then ask a direct yes/no. Only proceed on a clear yes to **this** option. See `cloudops-core` for the template.

## AWS — EC2

```bash
P=<profile>; R=<region>; NAME=<name>; TYPE=<instance-type>
MYIP="$(curl -s https://checkip.amazonaws.com)/32"

VPC=$(aws ec2 describe-vpcs --profile $P --region $R --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" = "None" ] && { echo "No default VPC in $R — ask the user how to proceed; do not create network infrastructure implicitly"; exit 1; }

# Ubuntu 24.04 LTS AMI via Canonical's public SSM parameter (use arm64 for Graviton types like t4g/m7g)
AMI=$(aws ssm get-parameter --profile $P --region $R \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)

aws ec2 import-key-pair --profile $P --region $R --key-name "$NAME" \
  --public-key-material "fileb://$HOME/.ssh/id_ed25519.pub" \
  --tag-specifications 'ResourceType=key-pair,Tags=[{Key=managed_by,Value=cloudops_agent}]'

SG=$(aws ec2 create-security-group --profile $P --region $R --group-name "$NAME-ssh" \
  --description "SSH from admin IP for $NAME" --vpc-id "$VPC" \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=managed_by,Value=cloudops_agent}]' \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --profile $P --region $R --group-id "$SG" --protocol tcp --port 22 --cidr "$MYIP"
```

Validate permissions and quota **without creating anything** — a successful dry run fails with `DryRunOperation`:

```bash
aws ec2 run-instances --dry-run --profile $P --region $R --image-id "$AMI" --instance-type $TYPE \
  --key-name "$NAME" --security-group-ids "$SG" --count 1 2>&1 | grep -q DryRunOperation && echo "dry run OK"
```

After the user confirms:

```bash
IID=$(aws ec2 run-instances --profile $P --region $R --image-id "$AMI" --instance-type $TYPE \
  --key-name "$NAME" --security-group-ids "$SG" --count 1 \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=managed_by,Value=cloudops_agent}]" \
                       "ResourceType=volume,Tags=[{Key=managed_by,Value=cloudops_agent}]" \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --profile $P --region $R --instance-ids "$IID"
aws ec2 describe-instances --profile $P --region $R --instance-ids "$IID" \
  --query 'Reservations[0].Instances[0].{id:InstanceId,state:State.Name,ip:PublicIpAddress,az:Placement.AvailabilityZone}'
```

`HttpTokens=required` enforces IMDSv2. The default SSH user is `ubuntu`. AWS bills the **public IPv4 address hourly**; mention it.

### AWS — Lightsail (flat monthly price, simplest "VPS")

Use when the user wants a predictable price. IDs come from `cloudops-catalog` (`get-blueprints`, `get-bundles`); don't hardcode them.

```bash
aws lightsail import-key-pair --profile $P --region $R --key-pair-name "$NAME" --public-key-base64 "$(base64 < ~/.ssh/id_ed25519.pub | tr -d '\n')"
aws lightsail create-instances --profile $P --region $R --instance-names "$NAME" \
  --availability-zone "${R}a" --blueprint-id <blueprint-id> --bundle-id <bundle-id> \
  --key-pair-name "$NAME" --tags key=managed_by,value=cloudops_agent
# New instances open 22 and 80 to the world. This call REPLACES the rule set:
aws lightsail put-instance-public-ports --profile $P --region $R --instance-name "$NAME" \
  --port-infos "fromPort=22,toPort=22,protocol=tcp,cidrs=$MYIP"
aws lightsail get-instance --profile $P --region $R --instance-name "$NAME" --query 'instance.{state:state.name,ip:publicIpAddress}'
```

Confirm the availability zone exists (`aws lightsail get-regions --include-availability-zones`) — `${R}a` is a guess.

## GCP — Compute Engine

```bash
PRJ=<project-id>; ZONE=<zone>; NAME=<name>; TYPE=<machine-type>
MYIP="$(curl -s https://checkip.amazonaws.com)/32"

gcloud services list --project $PRJ --enabled --filter="config.name=compute.googleapis.com" --format="value(config.name)"   # empty = enable first (CHANGE; tell the user)

gcloud compute firewall-rules create "$NAME-ssh" --project $PRJ --network default \
  --direction INGRESS --allow tcp:22 --source-ranges "$MYIP" --target-tags "$NAME-ssh"

gcloud compute instances create "$NAME" --project $PRJ --zone $ZONE --machine-type $TYPE \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 30GB \
  --labels managed_by=cloudops_agent --tags "$NAME-ssh" \
  --format="value(name,status,networkInterfaces[0].accessConfigs[0].natIP)"
```

If the image family is rejected, list families: `gcloud compute images list --filter="family~^ubuntu-2[24]04" --format="value(family,project)"`. If the `default` network does not exist (`gcloud compute networks list`), stop and ask — don't create networks implicitly. For no public SSH, use IAP: allow `35.235.240.0/20` on 22 instead of the admin IP and connect with `gcloud compute ssh --tunnel-through-iap`. There is no dry-run; rely on the preflight and the confirmation.

## Azure — Virtual Machines

Everything lives in a **resource group**; deleting the group later deletes it all. Reuse the user's group if they name one, otherwise create one and tell them its name.

```bash
SUB=<subscription-id>; RG=<resource-group>; LOC=<location>; NAME=<name>; SIZE=<Standard_B2s>
MYIP="$(curl -s https://checkip.amazonaws.com)/32"

az group show --subscription $SUB -n $RG -o none 2>/dev/null || \
  az group create --subscription $SUB -n $RG -l $LOC --tags managed_by=cloudops_agent -o none

# --nsg-rule NONE is essential: the default opens SSH to the entire internet.
az vm create --subscription $SUB -g $RG -n "$NAME" --image Ubuntu2204 --size $SIZE \
  --admin-username azureuser --generate-ssh-keys --public-ip-sku Standard \
  --nsg-rule NONE --tags managed_by=cloudops_agent \
  --query '{id:id,ip:publicIpAddress,state:powerState}' -o json

az network nsg rule create --subscription $SUB -g $RG --nsg-name "${NAME}NSG" -n allow-ssh-admin \
  --priority 1000 --direction Inbound --access Allow --protocol Tcp \
  --destination-port-ranges 22 --source-address-prefixes "$MYIP"
```

`--generate-ssh-keys` reuses `~/.ssh/id_rsa(.pub)` or creates one — tell the user. If `az vm create` reports no NSG named `${NAME}NSG`, find it with `az network nsg list -g $RG -o table`. List current image aliases with `az vm image list -o table` if `Ubuntu2204` is rejected.

## After creating (always)

1. Verify: describe the instance and show state + public IP.
2. Test reachability: `ssh -o ConnectTimeout=10 <user>@<ip> true` (ask before accepting an unknown host key if the user prefers). A timeout usually means the firewall rule or the admin IP is wrong → `cloudops-troubleshoot`.
3. Report: name/ID, IP, SSH user, the exact `ssh` command, region, estimated cost, and **how to stop vs. delete** (stopped VMs still bill for disk and public IP; Azure needs `deallocate`, not just `stop`) → `cloudops-server-manage`, `cloudops-delete`.
4. Offer next steps (install Docker, deploy an app) — don't do them unasked.

## Errors

- Quota / capacity (`VcpuLimitExceeded`, `InsufficientInstanceCapacity`, `ZONE_RESOURCE_POOL_EXHAUSTED`, `SkuNotAvailable`) → try another zone/size/region, offer it; see `cloudops-troubleshoot`.
- Permission errors → report the missing permission; don't escalate privileges.
- If a create times out at the transport layer, **look before retrying** — it may have succeeded.
