# Support Guidelines

## Getting Help

If you encounter issues or have questions regarding **ngl-pro**, please consult the following channels:

### 1. Documentation & Architecture
* Review the [README.md](README.md) for architecture breakdowns, deployment commands, and sequence diagrams.
* Review [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup with Wrangler and Firebase.
* Review [SECURITY.md](SECURITY.md) for threat models and vulnerability disclosure procedures.

### 2. Common Issues & Troubleshooting

* **OAuth Consent Screen Display:**
  Ensure you have deployed the authorized redirect URI using:
  ```bash
  npx firebase deploy --only auth
  ```
  The edge worker proxies `https://ngl.dulith.me/__/auth/*` directly to Firebase Auth.

* **Missing Telegram Notifications:**
  Ensure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in Cloudflare Pages encrypted environment variables.

### 3. Contact & Inquiries

For technical inquiries or questions about this deployment, contact the project maintainer:
* **Maintainer:** Duluth Divisekara
* **Email:** [contact@dulith.me](mailto:contact@dulith.me)
* **Domain:** [ngl.dulith.me](https://ngl.dulith.me)
