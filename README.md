# Anchorscape — Scan, Fix & Deploy from Claude Code

Scan your code for security vulnerabilities, auto-fix them, and deploy to production — all from your terminal. No context switching. No dashboards.

**Scan and fix are free** (done by Claude). Deploy to managed hosting with SSL, custom domains, and team sharing.

## Install

```bash
claude plugin add AnchorScape/claude-plugin
```

Or add to your `.mcp.json`:
```json
{
  "mcpServers": {
    "anchorscape": {
      "command": "npx",
      "args": ["@anchorscape/claude-plugin"]
    }
  }
}
```

## Skills

### `/anchorscape:scan` — Security Audit (Free)
Scans your codebase for security vulnerabilities, performance issues, architecture problems, and production readiness gaps. Generates a structured report.

- OWASP Top 10, injection flaws, hardcoded secrets
- N+1 queries, blocking I/O, memory leaks
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

### `/anchorscape:deploy` — Deploy to Production
Deploys your project to Anchorscape's managed infrastructure:
- Asks: development, staging, or production
- Zips and uploads your project
- Builds container automatically
- Returns a live URL with SSL

### `/anchorscape:status` — Check Deployments
View deployment status, logs, and health for all your projects.

## MCP Tools

The plugin includes 5 MCP tools for the deploy workflow:

| Tool | Description |
|------|-------------|
| `anchorscape_deploy` | ZIP and deploy project |
| `anchorscape_login` | Authenticate via browser OAuth |
| `anchorscape_status` | Check deployment status |
| `anchorscape_logs` | View deployment logs |
| `anchorscape_projects` | List projects and environments |

## Badges

Add deployment status and security score badges to your README:

```markdown
[![Deploy Status](https://anchorscape.com/api/badge/YOUR-PROJECT/status)](https://anchorscape.com)
[![Security Score](https://anchorscape.com/api/badge/YOUR-PROJECT/security)](https://anchorscape.com)
```

## How It Works

1. **Scan** — Claude reads your files and analyzes them for issues (runs locally, no API calls)
2. **Fix** — Claude applies fixes using its Edit tool (runs locally, no API calls)
3. **Deploy** — Your code is zipped and uploaded to Anchorscape's K8s infrastructure
4. **Live** — Your app is live at `https://your-app.anchorscape.com` with automatic SSL

Scanning and fixing are done entirely by Claude — we don't charge for them. You pay for hosting when you deploy.

## Free Tier

| Feature | Free | Pro |
|---------|------|-----|
| Security scans | Unlimited | Unlimited |
| Auto-fix | Unlimited | Unlimited |
| Active apps | 3 | 10+ |
| Custom domains | No | Yes |
| SSL | Yes | Yes |

## Links

- [Anchorscape](https://anchorscape.com) — Dashboard and docs
- [Report Issues](https://github.com/AnchorScape/claude-plugin/issues)

## License

MIT
