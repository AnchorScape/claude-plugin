# Anchorscape — Scan, Fix & Deploy from Claude Code

Scan your code for security vulnerabilities, auto-fix them, and deploy to production — all from your terminal. No context switching. No dashboards.

**Scan and fix are free** (done by Claude). Deploy to managed hosting with SSL, custom domains, and team sharing.

## Install

In Claude Code, run:

```bash
/plugin marketplace add AnchorScape/claude-plugin
/plugin install anchorscape
```

### Manual Install (from GitHub)

```bash
git clone https://github.com/AnchorScape/claude-plugin.git ~/.claude-plugins/anchorscape
cd ~/.claude-plugins/anchorscape
npm install && npm run build
```

Then add to your `~/.claude/.mcp.json` (or project `.mcp.json`):

```json
{
  "mcpServers": {
    "anchorscape": {
      "command": "node",
      "args": ["~/.claude-plugins/anchorscape/dist/index.js"],
      "env": {
        "ANCHOR_API_URL": "https://anchorscape.com"
      }
    }
  }
}
```

## Skills

### `/anchorscape:scan` — Security Audit (Free)
Scans your codebase for security vulnerabilities, performance issues, architecture problems, and production readiness gaps. Generates a structured report with scoring.

- OWASP Top 10, injection flaws, hardcoded secrets, XSS
- N+1 queries, blocking I/O, memory leaks, missing caching
- SOLID violations, error handling, code duplication
- Production readiness: logging, tests, CI/CD, health checks

Saves report to `.anchorscape/report.json`.

### `/anchorscape:fix` — Auto-Fix (Free)
Reads the scan report and automatically fixes issues:
- SQL injection → parameterized queries
- XSS → safe rendering
- Hardcoded secrets → environment variables
- Empty catch blocks → proper error handling
- And more

Includes **build verification** (reverts fixes that break compilation), **iteration loop** (re-fixes issues introduced by fixes, up to 3 rounds), and a **full rescan** for real before/after scores.

### `/anchorscape:test` — Generate & Run Tests (Free)
Detects your test framework, generates tests for security/performance fixes, and runs them:
- Auto-detects jest, vitest, pytest, go test, cargo test
- Generates regression tests for each fixed vulnerability
- Runs full suite, fixes failing tests (up to 3 attempts)

### `/anchorscape:deploy` — Deploy to Hosting
Deploys your project to Anchorscape's managed infrastructure:
- **Score gate**: checks scan report before deploying — warns on critical findings, blocks score < 40
- Choose environment: development, staging, or production
- Zips and uploads your project
- Builds container automatically
- Returns a live URL with SSL

### `/anchorscape:dev` — Iterative Dev Loop
The inner development loop. Deploy to dev, keep coding, redeploy on changes:
- Quick-scans only CRITICAL issues (fast, doesn't block)
- Deploys to a dev environment automatically
- Detects changed files on subsequent runs
- Tracks iteration history (deploy count, score trend)
- Say "redeploy", "scan", "logs", or "promote" at any time

### `/anchorscape:promote` — Environment Promotion
Promote your deployment through environments: **dev → staging → production**.
- Runs a full scan before each promotion
- Score gates per environment (staging: >= 50, production: >= 70)
- Blocks production deploys with CRITICAL findings
- Shows full environment overview after promotion

### `/anchorscape:pipeline` — Full Automated Chain
The "ship it" command. Runs everything end-to-end:

```
scan → fix (with iteration) → build → test → rescan → score gate → deploy
```

Stops if build fails. Warns if tests fail. Blocks deploy if score is too low.

### `/anchorscape:dns` — Custom Domain Setup
Step-by-step guide to connect your own domain:
- Generates exact DNS records to create (CNAME or A record)
- Provider-specific instructions for Cloudflare, GoDaddy, Namecheap, Route 53, Google Domains
- SSL auto-provisioned via Let's Encrypt
- Verification guidance and propagation times

### `/anchorscape:status` — Check Deployments
View deployment status, logs, and health for all your projects and environments.

## MCP Tools

The plugin includes 5 MCP tools for the deploy workflow:

| Tool | Description |
|------|-------------|
| `anchorscape_deploy` | ZIP and deploy project |
| `anchorscape_login` | Authenticate via browser OAuth |
| `anchorscape_status` | Check deployment status |
| `anchorscape_logs` | View deployment logs |
| `anchorscape_projects` | List projects and environments |

## Workflow

The typical development workflow:

```
/anchorscape:scan          Understand your codebase quality
/anchorscape:fix           Auto-fix security & performance issues
/anchorscape:test          Generate and run regression tests
/anchorscape:dev           Deploy to dev and iterate
  "redeploy"              Push changes
  "scan"                  Check score after new features
/anchorscape:promote       Push to staging for QA
/anchorscape:promote       Push to production
/anchorscape:dns           Set up your custom domain
```

Or skip straight to the automated pipeline:
```
/anchorscape:pipeline      Scan → fix → build → test → deploy
```

## Badges

Add deployment status and security score badges to your README:

```markdown
[![Deploy Status](https://anchorscape.com/api/badge/YOUR-PROJECT/status)](https://anchorscape.com)
[![Security Score](https://anchorscape.com/api/badge/YOUR-PROJECT/security)](https://anchorscape.com)
```

## How It Works

1. **Scan** — Claude reads your files and analyzes them for issues (runs locally, no API calls)
2. **Fix** — Claude applies fixes using its Edit tool (runs locally, no API calls)
3. **Test** — Claude generates and runs regression tests (runs locally)
4. **Deploy** — Your code is zipped and uploaded to Anchorscape's K8s infrastructure
5. **Live** — Your app is live at `https://your-app.anchorscape.com` with automatic SSL
6. **Iterate** — Keep developing, redeploy to dev, promote through environments

Scanning, fixing, and testing are done entirely by Claude — we don't charge for them. You pay for hosting when you deploy.

## Free Tier

| Feature | Free | Pro |
|---------|------|-----|
| Security scans | Unlimited | Unlimited |
| Auto-fix | Unlimited | Unlimited |
| Test generation | Unlimited | Unlimited |
| Active apps | 3 | 10+ |
| Custom domains | No | Yes |
| SSL | Yes | Yes |
| Environments | Dev only | Dev + Staging + Prod |

## Links

- [Anchorscape](https://anchorscape.com) — Dashboard and docs
- [DNS Setup Guide](https://anchorscape.com/guides/dns) — Custom domain configuration
- [Report Issues](https://github.com/AnchorScape/claude-plugin/issues)

## License

MIT
