# Anchorscape Promote — Environment Promotion

Promote your deployment from one environment to the next: **dev → staging → production**.

Each promotion runs a scan gate and requires explicit confirmation. This is the "ship it safely" command.

## Instructions

### Step 1: Detect Current State

Check what environments exist and their status:

1. Use `anchorscape_projects` MCP tool to list all environments
2. Read `.anchorscape/report.json` for the latest scan score
3. Determine the promotion path

Display:
```
────────────────────────────────────────────
  ANCHORSCAPE PROMOTE
────────────────────────────────────────────

  Project: <name>

  Environments:
    dev         LIVE    https://<app>-dev.anchorscape.com
    staging     —       not deployed
    production  —       not deployed

  Current Score: XX/100
  Promotion:     dev → staging

────────────────────────────────────────────
```

If the user specifies a target (e.g., "promote to production"), use that. Otherwise, promote to the next environment in sequence.

### Step 2: Pre-Promotion Scan

Run a full scan before any promotion (same as `/anchorscape:scan`):

```
  Running pre-promotion scan...

  Score: XX/100

  Findings:
    CRITICAL:  X
    HIGH:      X
    MEDIUM:    X
    LOW:       X
```

**Promotion gates by target environment:**

#### Promoting to Staging
- **Score >= 50, zero CRITICAL**: Proceed automatically
- **Score 30-49 OR has CRITICAL**: Warn, require confirmation
- **Score < 30**: Block. Suggest `/anchorscape:fix` first.

```
  Staging Gate: PASS (67/100, 0 critical)
  → Ready to promote to staging
```

#### Promoting to Production
- **Score >= 70, zero CRITICAL, zero HIGH**: Proceed with confirmation
- **Score 50-69 OR has HIGH findings**: Strong warning, require explicit confirmation
- **Score < 50 OR has CRITICAL**: Block. Must fix first.

```
  Production Gate: WARNING (62/100, 2 high findings)

  Top issues:
    1. [HIGH] Missing rate limiting — routes/api.ts:15
    2. [HIGH] No input validation on /submit — routes/forms.ts:42

  These should be fixed before going to production.
  Promote anyway? This is your call.
```

### Step 3: Deploy to Target Environment

Once the gate passes (or user confirms), deploy:

```
Use MCP tool: anchorscape_deploy
Arguments: {
  "directory": "<current project directory>",
  "environment": "<target environment>",
  "projectName": "<project name>"
}
```

Display:
```
  Promoting to <target>...

  [1/4] Packaging project          done
  [2/4] Uploading                  done
  [3/4] Building container         done
  [4/4] Deploying to <target>      done

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  PROMOTED TO <TARGET>
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  URL:       https://<app>.anchorscape.com
  Score:     XX/100
  Status:    Running

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Step 4: Post-Promotion Actions

After a successful promotion, display next steps based on the target:

#### After Promoting to Staging
```
  Staging is live. Here's what to do next:

  Share with your team:
    URL: https://<app>-staging.anchorscape.com

  When QA is complete:
    /anchorscape:promote           Promote to production
    "promote to production"        Same thing

  Need to iterate?
    /anchorscape:dev               Back to dev loop

  Check status:
    /anchorscape:status            View all environments
```

#### After Promoting to Production
```
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  PRODUCTION DEPLOY COMPLETE
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  URL:       https://<app>.anchorscape.com
  Score:     XX/100
  Status:    Running

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  Custom Domain Setup:
    Your app is live at the anchorscape.com subdomain.
    To use your own domain, run:
      /anchorscape:dns

  Badge for your README:
    [![Deployed on Anchorscape](https://anchorscape.com/api/badge/<app>/status)](https://anchorscape.com)

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  Environment Overview:
  ┌─────────────┬────────┬─────────────────────────────────┐
  │ Environment │ Status │ URL                             │
  ├─────────────┼────────┼─────────────────────────────────┤
  │ dev         │ LIVE   │ https://<app>-dev.anchor...     │
  │ staging     │ LIVE   │ https://<app>-staging.anchor... │
  │ production  │ LIVE   │ https://<app>.anchorscape.com   │
  └─────────────┴────────┴─────────────────────────────────┘
```

### Step 5: DNS Configuration (Production Only)

After a production promotion, remind about custom domains:

```
  Custom Domain?
  ─────────────
  Your app is reachable at: https://<app>.anchorscape.com

  To use your own domain (e.g., app.yourdomain.com):
    /anchorscape:dns    Step-by-step DNS setup
```

## Rollback

If the user says "rollback" or something went wrong:

```
  To rollback:
    The previous version is still available. Contact support
    or redeploy from a known-good commit:

    git checkout <previous-commit>
    /anchorscape:dev
    /anchorscape:promote
```

## Output Formatting

Same as `/anchorscape:dev` — clean, scannable, no emoji. Use Unicode box drawing for tables, `────` for dividers, `done` for completion markers.

## Important Notes

- **Always scan before promoting**: No exceptions. Even if the user just scanned, re-scan to verify.
- **Production requires confirmation**: Never auto-deploy to production. Always ask.
- **Show the URL prominently**: The deployed URL is the most important piece of information.
- **Track all environments**: Show the full environment overview after each promotion.
- **Staging is for sharing**: Emphasize sharing the staging URL with team/QA.
- **Don't skip environments**: dev → staging → production is the expected flow. If the user wants to go dev → production directly, warn them but allow it.
