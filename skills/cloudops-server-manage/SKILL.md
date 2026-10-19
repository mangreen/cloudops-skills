---
name: cloudops-server-manage
description: Use when listing, inspecting, starting, stopping, rebooting, or resizing existing VMs / servers on AWS (EC2, Lightsail), GCP (Compute Engine) or Azure. Use when user says "list my servers", "is my VM running", "what's the IP of …", "stop the server", "reboot it", "make it bigger", "列出主機", "重開機", "關機", "升級規格". For deleting a server use cloudops-delete.
---

# CloudOps Server Manage

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Listing is READ. Start/stop/reboot are CHANGE (downtime). Resize is CHANGE **and** changes the bill → treat as SPEND if it goes up. Deleting is DESTROY → `cloudops-delete`.

Always print the context line, and pass the target on every command.

## List and inspect (READ)

```bash
# AWS
aws ec2 describe-instances --profile <p> --region <r> \
  --query 'Reservations[].Instances[].{id:InstanceId, name:Tags[?Key==`Name`]|[0].Value, state:State.Name, type:InstanceType, ip:PublicIpAddress, az:Placement.AvailabilityZone, agent:Tags[?Key==`managed_by`]|[0].Value}' --output table
aws lightsail get-instances --profile <p> --region <r> --query 'instances[].{name:name, state:state.name, ip:publicIpAddress, bundle:bundleId}' --output table

# GCP
gcloud compute instances list --project <id> --format="table(name,zone.basename(),machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP,labels.managed_by)"

# Azure  (-d adds power state and IPs)
az vm list --subscription <id> -d -o table
az vm show --subscription <id> -g <rg> -n <name> -d -o json
```

AWS `describe-instances` covers one region; if the user says "all my servers", loop over regions (and say it will take a moment) or use `cloudops-inventory`.

Report `agent=cloudops_agent` rows separately from the rest — servers without that tag are not ours to modify without an explicit, named instruction.

## Start / stop / reboot (CHANGE)

Announce exactly what changes and the consequence, then run. **Confirm first** for production or when the user didn't name the exact server.

| | Start | Stop | Reboot |
|---|---|---|---|
| AWS EC2 | `aws ec2 start-instances --instance-ids <id>` | `aws ec2 stop-instances --instance-ids <id>` | `aws ec2 reboot-instances --instance-ids <id>` |
| AWS Lightsail | `aws lightsail start-instance --instance-name <n>` | `aws lightsail stop-instance --instance-name <n>` | `aws lightsail reboot-instance --instance-name <n>` |
| GCP | `gcloud compute instances start <n> --zone <z>` | `gcloud compute instances stop <n> --zone <z>` | `gcloud compute instances reset <n> --zone <z>` (hard reset) |
| Azure | `az vm start -g <rg> -n <n>` | `az vm deallocate -g <rg> -n <n>` | `az vm restart -g <rg> -n <n>` |

(append the target flags from the table in `cloudops-core`).

**What stopping does and doesn't save:**

- AWS EC2 / GCP: compute charges stop; **disks and reserved/public IPs keep billing**. The ephemeral public IP changes on the next start (AWS, GCP) unless an Elastic IP / reserved address is attached — tell the user, since DNS and firewall rules that use the IP will break.
- Azure: `az vm stop` keeps the VM allocated and **still bills compute**. Use `az vm deallocate` to stop compute charges.
- Stopped ≠ deleted. If the user's goal is "stop paying", say what still bills and offer `cloudops-delete`.

Reboot/stop kills running processes. If the server is serving traffic, say so first. Poll for the target state with a deadline (`aws ec2 wait instance-stopped` / `instance-running`, or `describe` in a loop for the others).

## Resize (change the machine type)

Requires a stop → change → start, i.e. **downtime**, and changes the price. Show before/after cost (use `cloudops-catalog`; never invent numbers) and get confirmation if the price goes up or the server is production.

```bash
# AWS EC2  (P=<profile>, R=<region>)
aws ec2 stop-instances --profile $P --region $R --instance-ids <id>
aws ec2 wait instance-stopped --profile $P --region $R --instance-ids <id>
aws ec2 modify-instance-attribute --profile $P --region $R --instance-id <id> --instance-type Value=<new-type>
aws ec2 start-instances --profile $P --region $R --instance-ids <id>

# GCP
gcloud compute instances stop <n> --zone <z> --project <id>
gcloud compute instances set-machine-type <n> --zone <z> --project <id> --machine-type <new-type>
gcloud compute instances start <n> --zone <z> --project <id>

# Azure (restarts the VM; may require deallocation if the new size is on another hardware cluster)
az vm list-vm-resize-options --subscription <id> -g <rg> -n <n> -o table
az vm resize --subscription <id> -g <rg> -n <n> --size <new-size>
```

Architecture must match: you cannot move between x86 and Arm (Graviton/Ampere/Cobalt) by resizing — that needs a new machine. Lightsail resize = snapshot and create from snapshot with a bigger bundle (SPEND).

## Verify

Re-describe the server: state is what you intended, new type applied, IP noted. Report downtime duration and the new estimated cost.

## Tips

- "Is it up?" → show state **and** do a real check (`ssh`/`curl`) — a running VM can still have a dead service. For services use `cloudops-logs`.
- Don't stop/reboot a server that other resources depend on (database host, NAT, bastion) without saying so.
