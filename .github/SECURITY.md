# Security Policy

## Supported Versions

Only the latest production deployment running on Cloudflare Pages and Google Cloud Firebase is actively maintained and receives security patches.

| Version | Edge Runtime | Status | Supported |
| :--- | :--- | :--- | :---: |
| **1.x** | Cloudflare Pages Advanced (`_worker.js`) | Production | Yes |
| **< 1.0** | Legacy monorepo snapshots | Deprecated | No |

## Zero-Trust Architecture & Threat Model

The **ngl-pro** architecture operates on a defense-in-depth model:

1. **Edge Credential Isolation**: Production secrets (`FIREBASE_API_KEY`, `OWNER_EMAIL`, `OWNER_UID`, `NGL_UPSTREAM_USERNAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) are stored exclusively in Cloudflare Pages encrypted environment variables. No secrets or personal credentials are stored in Git.
2. **Custom Auth Domain Proxy**: Firebase Authentication requests targeting `/__/auth/*` are reverse-proxied at the edge to Google Identity Toolkit, maintaining first-party origin parity and mitigating cross-site tracking vulnerabilities.
3. **API Key Guardrails**: Google Cloud API keys are locked via HTTP referrer restrictions (`https://ngl.dulith.me/*`, `https://ngl-dulith.pages.dev/*`, `https://ngl-dulith.firebaseapp.com/*`) and scoped strictly to `Identity Toolkit API`, `Cloud Firestore API`, and `Secure Token Service`.
4. **Database Access Control**: Firestore security rules enforce strict schema validation for anonymous submissions and restrict all read operations to the authenticated owner UID.
5. **Webhook Authorization**: `/api/telegram-webhook` validates incoming chat IDs against the encrypted `TELEGRAM_CHAT_ID` (and optional `TELEGRAM_WEBHOOK_SECRET` header) before returning telemetry or configuration responses.

## Reporting a Vulnerability

If you discover a potential security flaw or vulnerability within this project:

1. **Do NOT open a public GitHub issue.**
2. Send an encrypted or direct email to **[contact@dulith.me](mailto:contact@dulith.me)** with the subject line:
   `[SECURITY DISCLOSURE] ngl-pro - <Brief Description>`
3. Please include:
   - Steps to reproduce or proof-of-concept payload.
   - Affected endpoints or components (e.g., `_worker.js`, `firestore.rules`).
   - Assessed impact and potential mitigations.

### Response Timeline

* **Acknowledgment:** Within 24 hours of receipt.
* **Triage & Assessment:** Within 48 hours.
* **Remediation & Patch:** Typically deployed within 3 to 5 business days, depending on severity.
