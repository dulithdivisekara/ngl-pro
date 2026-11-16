# Contributing to ngl-pro

Thank you for your interest in contributing to **ngl-pro**! We follow structured engineering practices to maintain 1:1 parity with the official NGL platform, sub-millisecond edge latency, and strict security posture.

---

## Development Workflow

### 1. Local Environment Setup

1. Clone your fork or the repository:
   ```bash
   git clone https://github.com/dulithdivisekara/ngl-pro.git
   cd ngl-pro
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Prepare environment variables:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   Fill in your local testing keys (`FIREBASE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Remember that `.dev.vars` is ignored by Git and must never be committed.

4. Start local Cloudflare Pages preview:
   ```bash
   npx wrangler pages dev public
   ```

---

## Branching & Commit Conventions

### Branch Strategy
* `main`: Protected production branch. All commits must be verified against live endpoints.
* Feature branches: `feat/<feature-name>`
* Bugfix branches: `fix/<issue-name>`
* Security patches: `security/<patch-name>`

### Commit Messages
We adhere to [Conventional Commits](https://www.conventionalcommits.org/):
* `feat:` A new feature or capability.
* `fix:` A bug fix.
* `docs:` Documentation updates (`README.md`, `SECURITY.md`, etc.).
* `style:` UI, CSS, or formatting adjustments that do not alter logic.
* `refactor:` Code restructuring that does not modify behavior.
* `security:` Security fixes, credential rotation, or rules hardening.

---

## Code Quality Standards

* **Zero Hardcoded Secrets**: Under no circumstance should tokens, keys, or credentials be committed into the repository.
* **1:1 Visual Parity**: All UI alterations to `index.html` or `p/sent.html` must preserve exact layout, typography, animations, and color standards matching official NGL interfaces.
* **Edge Compatibility**: Code inside `public/_worker.js` must adhere strictly to the Cloudflare Workers / V8 isolate runtime constraints. Avoid Node.js-specific modules (`fs`, `net`, `child_process`).

---

## Submitting Pull Requests

1. Ensure all static assets, worker routes, and security rules test cleanly.
2. Push your changes to your feature branch:
   ```bash
   git push origin feat/your-feature-name
   ```
3. Open a Pull Request against `main`.
4. Provide a descriptive title and summary outlining:
   - What problem is solved.
   - Screenshots/video if changes touch the frontend UI.
   - Verification commands or test evidence.
