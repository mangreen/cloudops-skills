# Deploy on Google Cloud — Cloud Run

`gcloud run deploy --source .` builds (Dockerfile, or buildpacks when there isn't one), pushes to Artifact Registry and deploys — one command. Cloud Run **scales to zero** by default, so an idle service costs close to nothing.

Variables: `PRJ` = project ID, `REGION`, `NAME`.

## 1. Preflight (READ → one CHANGE)

```bash
gcloud billing projects describe $PRJ --format="value(billingEnabled)"        # must be True
gcloud services list --project $PRJ --enabled --format="value(config.name)" \
  | grep -E '^(run|cloudbuild|artifactregistry)\.googleapis\.com$'            # all three should appear
```

Missing APIs → tell the user which, then (CHANGE, free):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $PRJ
```

Does the service already exist?

```bash
gcloud run services describe $NAME --project $PRJ --region $REGION --format="value(status.url)" 2>/dev/null
```

A URL means **redeploy** (same command below), not a new service.

## 2. Source deploy

```bash
gcloud run deploy $NAME --project $PRJ --region $REGION --source . \
  --port 8080 --labels managed_by=cloudops_agent \
  --no-allow-unauthenticated \
  --quiet
```

- **Exposure — ask, don't assume:** `--allow-unauthenticated` makes it public (grants `allUsers` the invoker role); `--no-allow-unauthenticated` requires an IAM identity token. Public is EXPOSE-class. An organization policy (domain-restricted sharing) can block `allUsers`; if so, report it — don't work around it.
- `--port` is the container's listening port (default 8080). The app must also read `PORT` and bind `0.0.0.0`.
- `--quiet` auto-accepts prompts. The first source deploy in a region **creates an Artifact Registry repo named `cloud-run-source-deploy`** and may enable APIs — mention this in the confirmation, then pass `--quiet`.
- Deploy an existing image instead: replace `--source .` with `--image <registry>/<image>:<tag>`.
- Common options: `--set-env-vars K=V` (**replaces all** env vars — use `--update-env-vars` to merge; see `cloudops-config`), `--memory 512Mi`, `--cpu 1`, `--min-instances 0`, `--max-instances 10`, `--concurrency 80`, `--timeout 300`.
- Values containing commas break `--set-env-vars`; use `--env-vars-file env.yaml`.

Don't use `--min-instances` > 0 unless asked: those instances bill even when idle.

## 3. URL and verification

```bash
URL=$(gcloud run services describe $NAME --project $PRJ --region $REGION --format="value(status.url)")
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 15 "$URL"
```

A private service returns `403` to anonymous requests — that's the expected "pass". To test with identity, put the token in a `0600` curl config instead of the command line:

```bash
CFG=$(mktemp); chmod 600 "$CFG"; trap 'rm -f "$CFG"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$(gcloud auth print-identity-token)" > "$CFG"
curl -sS -K "$CFG" -o /dev/null -w "%{http_code}\n" --max-time 15 "$URL"
```

Latest revision and whether it's serving:

```bash
gcloud run services describe $NAME --project $PRJ --region $REGION \
  --format="value(status.latestReadyRevisionName,status.latestCreatedRevisionName)"
```

If the two names differ, the newest revision is failing to become ready → `cloudops-logs`.

## 4. Build/deploy failures (the usual ones)

| Error | Meaning / fix |
|-------|---------------|
| `Build failed` / `NOT_FOUND: Build failed` | `gcloud builds list --project $PRJ --limit 1 --format="value(id,status)"`, then `gcloud builds log <id> --project $PRJ` |
| `denied: Permission "artifactregistry.repositories.…" denied` or build-service-account errors | Cloud Build uses the **Compute Engine default service account** by default. It needs the Cloud Run Builder role. IAM change — ask first: `gcloud projects add-iam-policy-binding $PRJ --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" --role="roles/run.builder"` |
| `iam.serviceaccounts.actAs` denied | The deploying user lacks `roles/iam.serviceAccountUser` on the runtime service account. Report; or deploy with a dedicated `--service-account` the user owns |
| `The user-provided container failed to start and listen on the port` | Wrong port, binds to localhost, or crashes at start → `cloudops-logs`, `cloudops-troubleshoot` |
| `SERVICE_DISABLED` | Enable the named API (CHANGE) |
| Only available in some regions | Source deploy needs Artifact Registry + Cloud Build in that region |

Source upload size is limited; add a `.gcloudignore` (or rely on `.gitignore`) so `node_modules`, `.git`, and local env files aren't uploaded — **check that `.env` files aren't being shipped into the build**.

## What bills

Request/CPU/memory time while instances run (nothing at zero), Cloud Build minutes (a free tier applies), Artifact Registry storage, egress, Cloud Logging above the free tier. Min-instances and "CPU always allocated" bill continuously.
