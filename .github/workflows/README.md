# Evening Scan Cron

`evening-scan.yml` runs every day at **9:00 PM Pacific** via GitHub Actions
(free, always-on — does not depend on Render staying awake). It:

1. Wakes the Render server (free tier sleeps after 15 min of idle).
2. Calls `POST /api/cron-evening-scan` to trigger a fresh scan of:
   - eBay base set listings
   - Fanatics Collect 1999 base set PSA 10
   - Mercari (last 60 days)
   - TCGplayer
3. Polls until each scan is finished (up to 12 min).
4. Builds an HTML email summarising every source.
5. Emails it to `slikqaz@gmail.com` via Gmail SMTP.

## Required GitHub repo secrets

| Secret           | Required | Purpose                                                              |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `CRON_TOKEN`     | optional | Shared secret for `/api/cron-evening-scan`. Set the same value as the `CRON_TOKEN` env var on Render. If unset on the server, the endpoint is open. |
| `MAIL_USERNAME`  | yes      | Gmail address used to *send* the email. (Recipient is `slikqaz@gmail.com`.) |
| `MAIL_PASSWORD`  | yes      | Gmail App Password — generate one at https://myaccount.google.com/apppasswords (NOT your normal password). |
| `MAIL_TO`        | optional | Override the recipient. Defaults to `slikqaz@gmail.com`.             |
| `RENDER_BASE_URL`| optional | Override the server URL. Defaults to `https://pokemon-scanner.onrender.com`. |

## One-time setup

```sh
# Set repo secrets (requires gh CLI authenticated for this repo)
gh secret set MAIL_USERNAME --body "your.gmail@gmail.com"
gh secret set MAIL_PASSWORD --body "<16-char gmail app password>"
gh secret set CRON_TOKEN    --body "$(openssl rand -hex 16)"
```

Then on Render, set the same `CRON_TOKEN` env var so the endpoint accepts the
request.

## Fallback if SMTP secrets aren't set

If `MAIL_USERNAME` is not set, the workflow still runs the scan and uploads
the HTML email body as a workflow artifact you can download from the Actions
tab. The server will *also* try to send via Resend/Brevo if you set
`RESEND_API_KEY` or `BREVO_API_KEY` as Render env vars.

## Manual test

```sh
gh workflow run evening-scan.yml
```
