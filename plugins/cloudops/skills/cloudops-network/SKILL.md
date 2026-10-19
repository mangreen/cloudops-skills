---
name: cloudops-network
description: Use when opening or closing ports, editing firewall / security-group / NSG rules, restricting access to an IP, or auditing what is exposed to the internet on AWS, GCP or Azure. Use when user says "open port 443", "allow my IP", "close SSH", "what's exposed", "why can't I connect to port 5432", "開 port", "防火牆", "安全群組", "檢查有哪些對外開放". Opening a port to the world is EXPOSE-class — explicit confirmation required.
---

# CloudOps Network — firewalls & exposure

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Listing rules is READ. Adding/removing rules is **CHANGE**, and anything reachable from `0.0.0.0/0` is **EXPOSE** — confirm it with who-can-reach-what wording.

## Principles

1. **Narrowest scope that works:** a specific IP (`<ip>/32`) or the app's own security group/tag, not the internet. Find the user's current IP with `curl -s https://checkip.amazonaws.com` (an external call — say so).
2. **Never open admin/data ports to `0.0.0.0/0`:** 22 (SSH), 3389 (RDP), 3306, 5432, 1433, 6379, 27017, 9200, 11211, 2375, 5984, 445. If the user insists, restate the risk in one sentence and require an explicit "yes, open it to everyone". Suggest alternatives: private networking, SSM/IAP/Bastion, a VPN, or time-boxed access.
3. **Web ports (80/443) on a public service are normal** — still say it.
4. **Name rules after their purpose and tag them** (`managed_by=cloudops_agent` where supported). Record each rule you create (name/ID + what it opens) so it can be removed later.
5. **Removing a rule can cut off the user's own access** (including the SSH session you're using). Check that another path exists before removing; never delete a rule you didn't create without explicit naming.
6. **Rules change the data path, not the app.** A closed port and a stopped service look identical to a client — verify both (`cloudops-troubleshoot`).

## Audit: what is open to the world? (READ)

```bash
# AWS — security groups with any 0.0.0.0/0 or ::/0 ingress
aws ec2 describe-security-groups --profile <p> --region <r> --output json | jq -r '
  .SecurityGroups[] | . as $g
  | [ .IpPermissions[] | select(any(.IpRanges[]?; .CidrIp=="0.0.0.0/0") or any(.Ipv6Ranges[]?; .CidrIpv6=="::/0"))
      | "\(.IpProtocol):\(.FromPort // "all")-\(.ToPort // "all")" ] as $open
  | select($open | length > 0) | "\($g.GroupId)\t\($g.GroupName)\t\($open | join(","))"'

# GCP — ingress rules that allow the whole internet
gcloud compute firewall-rules list --project <id> --filter="direction=INGRESS AND sourceRanges:0.0.0.0/0 AND disabled=false" \
  --format="table(name,network.basename(),allowed[].map().firewall_rule().list(),targetTags.list())"

# Azure — NSG rules allowing Internet / * sources
az network nsg list --subscription <id> -o json | jq -r '
  .[] | . as $n | .securityRules[]?
  | select(.direction=="Inbound" and .access=="Allow"
      and ([.sourceAddressPrefix] + (.sourceAddressPrefixes // []) | any(. == "*" or . == "Internet" or . == "0.0.0.0/0")))
  | "\($n.resourceGroup)/\($n.name)\t\(.name)\t\(.protocol)\t\(.destinationPortRange // (.destinationPortRanges|join(",")))"'
```

Report the findings sorted by severity: sensitive ports open to the world first. Suggest fixes; don't apply them unasked.

## List rules for one resource (READ)

```bash
aws ec2 describe-security-groups --profile <p> --region <r> --group-ids <sg-id> --query 'SecurityGroups[0].IpPermissions'
gcloud compute firewall-rules describe <name> --project <id>
az network nsg rule list --subscription <id> -g <rg> --nsg-name <nsg> -o table
```

## Open a port to a specific source (CHANGE → EXPOSE if the source is the internet)

### AWS

```bash
aws ec2 authorize-security-group-ingress --profile <p> --region <r> --group-id <sg-id> --protocol tcp --port 443 --cidr <cidr>
# allow another security group instead of an IP range (e.g. app → database):
aws ec2 authorize-security-group-ingress --profile <p> --region <r> --group-id <db-sg> \
  --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=<app-sg>}]"
```

### GCP

Rules apply to instances by **network tag** (or service account). Create a rule scoped to a tag, then tag the instance.

```bash
gcloud compute firewall-rules create <name> --project <id> --network <network> --direction INGRESS \
  --allow tcp:443 --source-ranges <cidr> --target-tags <tag>
gcloud compute instances add-tags <instance> --zone <z> --project <id> --tags <tag>
```

(Cloud Run and Container Apps/ECS Express services are reached through their managed front end; firewalls don't apply — see Notes.)

### Azure

```bash
az network nsg rule create --subscription <id> -g <rg> --nsg-name <nsg> -n <rule-name> \
  --priority <100-4096, unused> --direction Inbound --access Allow --protocol Tcp \
  --destination-port-ranges 443 --source-address-prefixes <cidr>
```

Priorities must be unique per NSG — list existing rules first and pick a free number. Lower number wins.

## Close / remove (CHANGE — name the rule)

```bash
aws ec2 revoke-security-group-ingress --profile <p> --region <r> --group-id <sg-id> --protocol tcp --port 22 --cidr <cidr>
gcloud compute firewall-rules delete <name> --project <id> --quiet          # --quiet only after confirmation
az network nsg rule delete --subscription <id> -g <rg> --nsg-name <nsg> -n <rule-name>
```

Re-list afterwards to prove the rule is gone and the intended access still works.

## Notes by service type

- **Managed container services** (Cloud Run, Container Apps, ECS Express): exposure is controlled by *ingress/auth settings*, not firewalls — Cloud Run `--allow-unauthenticated` vs IAM, Container Apps `--ingress external|internal`, ECS Express public endpoint. Change those with `cloudops-deploy`/`cloudops-config` and treat "public" as EXPOSE.
- **Databases:** prefer no public endpoint at all (`cloudops-database`).
- **Egress** rules are rarely the problem; don't touch them unless asked.
- **VPC/subnet/route changes** (new networks, NAT, peering) are out of scope here — they're SPEND/DESTROY-class infrastructure; ask the user how they want it done.

## Troubleshooting a blocked connection

`Connection timed out` usually means a firewall/route problem (silently dropped); `Connection refused` means the packet arrived but nothing listens on that port. Check in order: the service is listening (`ss -tlnp` via `cloudops-server-exec`), the cloud firewall allows the source IP and port, the instance has a public IP, and the user's IP hasn't changed since the rule was created.
