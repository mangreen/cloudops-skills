---
name: cloudops-domain-dns
description: Use when managing DNS records or pointing a custom domain at a service — add/update/delete A, AAAA, CNAME, TXT records in Route 53, Cloud DNS or Azure DNS; attach a custom domain and HTTPS certificate to Cloud Run or Container Apps; check DNS propagation. Use when user says "point my domain to", "add a DNS record", "custom domain", "set up HTTPS for example.com", "綁定網域", "新增 DNS 記錄", "CNAME", "網域指向". Does NOT register or buy domains.
---

# CloudOps Domain & DNS

> **Use only `aws` (v2), `gcloud`, `az`** (plus `dig`/`nslookup` for checks). Read `cloudops-core` first. Reading is READ. Creating/changing/deleting records is **CHANGE** with real outage potential — a wrong `A`/`CNAME`/`MX` takes a site or an inbox down.

**Out of scope: buying or transferring domains.** It needs legal registrant data and is hard to reverse. Tell the user to register at their registrar/the cloud console, then come back to point it at a service.

## Before any change

1. **Which zone?** Find the hosted zone for the domain, and confirm the registrar's nameservers actually point at it — otherwise your records are never served:
   ```bash
   dig +short NS example.com          # should list the zone's nameservers
   ```
2. **Show the existing record** for that name+type and say what will change (before → after, and the TTL). Overwriting or deleting an existing record needs confirmation. Never touch `MX`, `TXT` (SPF/DKIM/DMARC), or `NS` records unless that's the explicit request — they carry email and delegation.
3. **Apex (`example.com`) can't be a `CNAME`.** Use an alias record (Route 53 `A` + `AliasTarget`), an `A` record with the target's IP, or the cloud's flattening/alias feature.
4. Lower the TTL (e.g. 300) before a planned cutover; mention the old TTL is how long clients may keep the old answer.

## Find the zone / list records (READ)

```bash
aws route53 list-hosted-zones-by-name --profile <p> --dns-name example.com --max-items 1 --query 'HostedZones[0].{id:Id,name:Name,private:Config.PrivateZone}'
aws route53 list-resource-record-sets --profile <p> --hosted-zone-id <zone-id> --query "ResourceRecordSets[?Name=='app.example.com.']"

gcloud dns managed-zones list --project <id> --format="table(name,dnsName,visibility)"
gcloud dns record-sets list --project <id> --zone <zone> --name app.example.com.

az network dns zone list --subscription <id> -o table
az network dns record-set list --subscription <id> -g <rg> -z example.com -o table
```

Route 53 returns IDs like `/hostedzone/Z123…` — use the part after the last `/`. GCP names end with a trailing dot (`app.example.com.`). Azure uses names **relative to the zone** (`app`, `@` for the apex).

## Create / update records

### Route 53 (UPSERT via a change batch)

```bash
cat > /tmp/dns-change.json <<'EOF'
{"Comment":"cloudops: point app at service","Changes":[{"Action":"UPSERT","ResourceRecordSet":
  {"Name":"app.example.com.","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"<target-hostname>"}]}}]}
EOF
aws route53 change-resource-record-sets --profile <p> --hosted-zone-id <zone-id> --change-batch file:///tmp/dns-change.json
```

Alias to a load balancer (works at the apex): `"Type":"A","AliasTarget":{"HostedZoneId":"<lb-zone-id>","DNSName":"<lb-dns>","EvaluateTargetHealth":false}` (no `TTL`/`ResourceRecords`). `UPSERT` creates or **overwrites**; use `CREATE` if the record must not already exist. `DELETE` must repeat the record's exact current values.

### Cloud DNS

```bash
gcloud dns record-sets create  app.example.com. --project <id> --zone <zone> --type A     --ttl 300 --rrdatas <ip>
gcloud dns record-sets create  app.example.com. --project <id> --zone <zone> --type CNAME --ttl 300 --rrdatas <target>.
gcloud dns record-sets update  app.example.com. --project <id> --zone <zone> --type A     --ttl 300 --rrdatas <new-ip>
gcloud dns record-sets delete  app.example.com. --project <id> --zone <zone> --type A     # after confirmation
```

A CNAME's target ends with a dot in Cloud DNS.

### Azure DNS

```bash
az network dns record-set a add-record      --subscription <id> -g <rg> -z example.com -n app --ipv4-address <ip>
az network dns record-set cname set-record  --subscription <id> -g <rg> -z example.com -n app -c <target-hostname>
az network dns record-set a delete          --subscription <id> -g <rg> -z example.com -n app --yes    # after confirmation
```

`add-record` **adds** an IP to the set (round-robin) rather than replacing; to change an address, remove the old one (`remove-record`) or delete the set first.

## Check propagation (READ)

```bash
dig +short app.example.com @8.8.8.8
dig +short app.example.com @<authoritative-ns>      # immediate answer from the zone itself
```

If the authoritative server is right but public resolvers aren't, it's TTL/caching — wait, don't re-edit.

## Custom domain on a deployed service

### GCP — Cloud Run

```bash
gcloud beta run domain-mappings create --project <id> --region <r> --service <svc> --domain app.example.com
gcloud beta run domain-mappings describe --project <id> --region <r> --domain app.example.com --format="value(status.resourceRecords)"
```

Add the DNS records it prints (type/name/value), then wait for the managed certificate (can take up to ~15–60 min). The domain must be **verified** for the account first. Domain mappings are limited to certain regions and are a Preview feature; for production-scale needs, a global external Application Load Balancer is the usual route — say so and ask.

### Azure — Container Apps

```bash
az containerapp show --subscription <id> -g <rg> -n <name> --query "{fqdn:properties.configuration.ingress.fqdn, verificationId:properties.customDomainVerificationId}" -o json
```

Add DNS records: a `CNAME` from `app` → the app's FQDN, and a `TXT` record named `asuid.app` with the verification ID (apex: `A` record to the environment IP + `TXT asuid`). Then:

```bash
az containerapp hostname add  --subscription <id> -g <rg> -n <name> --hostname app.example.com
az containerapp hostname bind --subscription <id> -g <rg> -n <name> --hostname app.example.com --environment <env> --validation-method CNAME
```

`bind` issues a free managed certificate. DNS must resolve to the app **before** `bind`.

### AWS — ECS Express Mode

A custom domain needs an **ACM certificate** (HTTPS) and DNS pointing at the service. Certificate issuance with DNS validation is plain CLI:

```bash
aws acm request-certificate --profile <p> --region <r> --domain-name app.example.com --validation-method DNS --query CertificateArn --output text
aws acm describe-certificate --profile <p> --region <r> --certificate-arn <arn> --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
# create the CNAME it shows (Route 53 UPSERT above), then:
aws acm wait certificate-validated --profile <p> --region <r> --certificate-arn <arn>
```

Attaching that certificate to the Express-managed load balancer is **not covered here** — I haven't verified a supported CLI path, and editing the managed ALB directly may be overwritten or unsupported. Follow AWS's current ECS Express Mode custom-domain guide, or ask the user whether to put their own CloudFront/ALB in front. **A bare CNAME to the Express endpoint will not serve valid HTTPS for another hostname.**

## Verify and report

`dig` the name, then `curl -sSI https://app.example.com | head -1` (and look at certificate errors if it fails). Report the exact records created (so they can be undone), TTLs, and that certificates may still be provisioning.
