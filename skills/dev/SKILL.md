# Anchorscape Dev — Iterative Development Loop

You are running an iterative development session. Deploy to a **dev environment**, keep coding, detect changes, rescan, redeploy — loop until the developer is satisfied.

This is the "inner loop" command. It turns your local project into a live dev server you can iterate on.

## Instructions

### Step 1: Initialize Dev Session

Check the project and current deployment state:

1. Read `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` etc. to identify the project
2. Check for existing `.anchorscape/report.json` from a previous scan
3. Use the `anchorscape_projects` MCP tool to check if a dev environment already exists

Display:
```
────────────────────────────────────────────
  ANCHORSCAPE DEV
────────────────────────────────────────────

  Project:     <name>
  Framework:   <detected>
  Directory:   <path>

  Dev Environment:
    Status:    NEW (first deploy)
               — or —
    Status:    LIVE at https://<app>-dev.anchorscape.com
    Last Deploy: <time ago>
    Last Score:  XX/100

────────────────────────────────────────────
```

### Step 2: Quick Scan (Baseline)

Run a lightweight scan — NOT the full `/anchorscape:scan`. Focus on:

1. **CRITICAL security issues only**: Hardcoded secrets, SQL injection, command injection
2. **Build readiness**: Does the project compile/build?

Use these focused Grep checks:
- `Grep("password\\s*=\\s*['\"]|api_key\\s*=\\s*['\"]|secret\\s*=\\s*['\"]", glob: "*.{ts,js,py,rb,go}")`
- `Grep("query.*\\$\\{|execute.*\\$\\{|exec\\(.*\\$\\{", glob: "*.{ts,js,py}")`

If CRITICAL issues found:
```
  !! CRITICAL issues detected — fixing before deploy

  1. Hardcoded API key in config.ts:8
  2. SQL injection in db.ts:42

  Auto-fixing...
```

Apply quick fixes for CRITICALs only (same patterns as `/anchorscape:fix`), then continue.

If no CRITICALs: proceed directly to deploy.

### Step 3: Deploy to Dev

Use the `anchorscape_deploy` MCP tool with `environment: "development"`:

```
Use MCP tool: anchorscape_deploy
Arguments: {
  "directory": "<current project directory>",
  "environment": "development",
  "projectName": "<detected project name>"
}
```

Display during deploy:
```
  Deploying to dev...

  [1/4] Packaging project          done
  [2/4] Uploading to Anchorscape   done
  [3/4] Building container         done
  [4/4] Starting deployment        done

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  DEV ENVIRONMENT LIVE
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  URL:    https://<app>-dev.anchorscape.com
  Status: Running
  Score:  XX/100 (or "not scanned" if skipped)

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  Your dev server is live. Keep coding — when
  you're ready to update, just say "redeploy"
  or run /anchorscape:dev again.

  Commands:
    "redeploy"            Push latest changes
    "scan"                Full security scan
    "logs"                View dev server logs
    "promote to staging"  When you're happy
    /anchorscape:promote  Formal promotion flow

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Step 4: Watch for Changes (Conversation Loop)

After initial deploy, enter an interactive mode. When the user says any of these, take the corresponding action:

**"redeploy"** or **"push"** or **"deploy"** or runs `/anchorscape:dev` again:
1. Detect what files changed since last deploy using `git diff --name-only` or by reading the project
2. Show a brief diff summary:
```
  Changes detected since last deploy:

    Modified:  src/api/routes.ts
    Modified:  src/services/auth.ts
    Added:     src/middleware/rateLimit.ts
    Deleted:   src/utils/oldHelper.ts

    4 files changed
```
3. Quick-scan only the changed files for CRITICALs
4. Redeploy:
```
  Redeploying to dev...

    Changes:   4 files
    CRITICALs: 0 (clean)
    Building:  done
    Deploying: done

  DEV UPDATED — https://<app>-dev.anchorscape.com

  Changes in this deploy:
    + Added rate limiting middleware
    + Updated auth service
    - Removed deprecated helper
```

**"scan"** or **"full scan"**:
1. Run the full `/anchorscape:scan` procedure
2. Show before/after comparison if a previous score exists:
```
  Full Scan Complete

    Previous: 62/100  (3 high, 5 medium)
    Current:  71/100  (1 high, 4 medium)

    Improvement: +9 points
    Fixed:       2 high findings resolved
    New:         0 new findings

  To auto-fix remaining issues: /anchorscape:fix
```

**"logs"**:
1. Use `anchorscape_logs` MCP tool
2. Display formatted log output

**"status"**:
1. Use `anchorscape_status` MCP tool
2. Show health, uptime, recent errors

**"promote"** or **"push to staging"** or **"ready for staging"**:
1. Trigger the `/anchorscape:promote` flow (see promote skill)

### Step 5: Iteration Tracking

Keep a running session summary. After each action, show the iteration count:

```
  Dev Session: Iteration 3

  ┌──────┬──────────┬────────────────────────────┐
  │  #   │ Action   │ Result                     │
  ├──────┼──────────┼────────────────────────────┤
  │  1   │ Deploy   │ Initial deploy — LIVE      │
  │  2   │ Redeploy │ 3 files changed            │
  │  3   │ Scan     │ Score: 62 → 71 (+9)        │
  └──────┴──────────┴────────────────────────────┘

  Score Trend: 62 → 71  (+9)

  URL: https://<app>-dev.anchorscape.com
```

## Output Formatting

Use these Unicode elements consistently:

| Element | Character |
|---------|-----------|
| Section divider | `────────────────────────` |
| Success | `done` (lowercase, clean) |
| Warning | `!!` prefix |
| Error | `XX` prefix |
| Progress steps | `[1/4]` numbered |
| Checkmark | plain `done` or `ok` |
| Bullet | `-` or `+` / `-` for add/remove |
| Box drawing | `┌ ─ ┬ ┐ │ ├ ┼ ┤ └ ┴ ┘` |

Keep output **clean and scannable**. No emoji. No walls of text. Developers want signal, not noise.

## Important Notes

- **Dev environment only**: This skill NEVER deploys to staging or production. Use `/anchorscape:promote` for that.
- **Quick scan, not full scan**: Initial scan checks CRITICALs only. Full scans are opt-in via "scan" command.
- **Don't block on warnings**: MEDIUM and LOW findings should not prevent dev deploys. Only CRITICAL issues warrant a fix-before-deploy.
- **Track iterations**: Show the session history so developers know what they've done.
- **Be fast**: Dev loop should feel instant. Minimize scan time, maximize deploy speed.
- **Changed files only**: On redeploy, only scan files that actually changed — not the whole project.
- If the dev environment doesn't exist yet, the first deploy creates it automatically.
