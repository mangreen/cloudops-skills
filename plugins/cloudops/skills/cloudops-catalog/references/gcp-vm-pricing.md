# GCP VM price derivation (best-effort)

Google bills predefined machine types as **vCPU-hours + GB-of-RAM-hours**, each with its own SKU. There is no `gcloud` command for list prices, so use the Cloud Billing Catalog API with the CLI's access token.

> The unit prices in the mock example at the bottom are **made up** to show the arithmetic. Never quote them. Quote only numbers returned by the API in this session.

## 1. Authenticate without leaking the token

Keep the token out of the process list: write it into a `0600` curl config and pass it with `-K`.

```bash
CFG=$(mktemp); chmod 600 "$CFG"; trap 'rm -f "$CFG"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$(gcloud auth print-access-token)" > "$CFG"
```

If the API answers `403 … has not been used in project` or asks for a quota project, enable `cloudbilling.googleapis.com` on the working project and add `-H "x-goog-user-project: <project-id>"`.

Each tool call is a fresh shell — run steps 1–3 in the same block.

## 2. Find the Compute Engine service ID (don't hardcode it)

```bash
SVC=$(curl -sS -K "$CFG" "https://cloudbilling.googleapis.com/v1/services?pageSize=500" \
  | jq -r '.services[] | select(.displayName=="Compute Engine") | .name')
echo "$SVC"        # services/XXXX-XXXX-XXXX
```

## 3. Page through SKUs, keeping only what you need

Compute Engine has thousands of SKUs. Filter each page as it arrives instead of holding everything.

```bash
SERIES="E2"            # machine family prefix as it appears in SKU descriptions: E2, N2, N2D, C3, T2D ...
REGION="asia-east1"    # region ID (serviceRegions uses IDs, not names)
TOKEN=""; : > /tmp/gce-skus.ndjson
while :; do
  PAGE=$(curl -sS -K "$CFG" -G "https://cloudbilling.googleapis.com/v1/$SVC/skus" \
           --data-urlencode "currencyCode=USD" --data-urlencode "pageSize=5000" \
           ${TOKEN:+--data-urlencode "pageToken=$TOKEN"})
  echo "$PAGE" | jq -c --arg s "$SERIES" --arg r "$REGION" \
    '.skus[]? | select(.category.usageType=="OnDemand") | select(.serviceRegions | index($r)) | select(.description | startswith($s + " Instance"))' >> /tmp/gce-skus.ndjson
  TOKEN=$(echo "$PAGE" | jq -r '.nextPageToken // empty')
  [ -z "$TOKEN" ] && break
done
wc -l < /tmp/gce-skus.ndjson      # expect a small handful (core + RAM, maybe a few variants)
```

Stop on any HTTP error or empty `skus` — report "estimate unavailable" rather than continuing.

## 4. Combine core + RAM for the chosen shape

```bash
VCPU=2; GB=4            # from `gcloud compute machine-types describe <type> --zone <z> --format="value(guestCpus,memoryMb)"` (memoryMb / 1024)
jq -s --argjson vcpu "$VCPU" --argjson gb "$GB" '
  def price: (.pricingInfo[0].pricingExpression.tieredRates | map(select(.startUsageAmount==0)) | .[0].unitPrice
              | ((.units|tonumber) + (.nanos/1e9)));
  { core: ([.[] | select(.description|test("Core"))] | .[0] | price),
    ram:  ([.[] | select(.description|test("Ram"))]  | .[0] | price) }
  | .hourly  = (.core*$vcpu + .ram*$gb)
  | .monthly = (.hourly*730)' /tmp/gce-skus.ndjson
```

Sanity-check before quoting: the result should be the same order of magnitude as other clouds' equivalent size. If a SKU is missing, `price` errors or returns `null` — treat that as "estimate unavailable".

## Limits of this method

- Valid for **predefined** types of a family that uses separate Core/Ram SKUs (E2 standard, N2, N2D, C3, …).
- **Not valid** for shared-core types (`e2-micro`, `e2-small`, `e2-medium`), custom machine types (extended memory is a separate SKU), GPUs, Spot, or committed-use discounts.
- Excludes the boot disk, external IP, egress and OS licence costs (Windows, RHEL, SLES).
- Sustained-use / committed-use discounts are not applied; the result is the list on-demand price.

## Mock illustration (made-up unit prices)

With core = 0.0249 USD/h and RAM = 0.0033 USD/GB-h, a 2 vCPU / 4 GB shape is `2×0.0249 + 4×0.0033 = 0.063 USD/h ≈ 45.99 USD/month`. This only demonstrates the formula.
