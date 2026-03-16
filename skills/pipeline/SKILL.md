# Anchorscape Pipeline

You are running the full Anchorscape pipeline: scan, fix, build, test, rescan, and deploy — automated end-to-end.

This is the "ship it" command. It takes a project from raw code to deployed and verified.

## Instructions

### Step 0: Pre-flight

Before doing anything, display this banner:

```
╔═══════════════════════════════════════════════╗
║           ⚓  ANCHORSCAPE                     ║
║           P I P E L I N E                    ║
║                                              ║
║  scan → fix → build → test → rescan → deploy ║
╚═══════════════════════════════════════════════╝
```

Check the project directory:
1. Confirm source files exist (not an empty directory)
2. Read `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` etc. to identify the project
3. Check for existing `.anchorscape/report.json` from a previous scan

Display:
```
Anchorscape Pipeline Starting

Project: <name>
Framework: <detected>
Directory: <path>

Pipeline: scan → fix → build → test → rescan → deploy
```

### Step 1: Scan

Run the full scan procedure from `/anchorscape:scan`:
- Discover project structure
- Security audit (OWASP, injection, secrets, XSS, config)
- Performance audit (N+1, blocking I/O, memory, caching)
- Architecture audit (SOLID, error handling, duplication)
- Production readiness gaps
- Score and save to `.anchorscape/report.json`

Display the initial score and finding counts.

If score >= 85 and zero CRITICAL/HIGH findings, skip to Step 4 (build).

### Step 2: Fix (with iteration)

Run the fix procedure from `/anchorscape:fix`:
- Load report, sort by severity
- Fix CRITICAL findings first, then HIGH, then MEDIUM
- Track all changes

**Iteration loop** (max 3 rounds):

After applying fixes:
1. Run a quick targeted rescan — Grep for the same patterns that triggered the original findings
2. If fixes introduced NEW findings (e.g., file grew past 500 lines, new import created circular dep):
   - Fix the new findings
   - Rescan again
3. Continue until no new findings or max 3 rounds reached

Display after each round:
```
Fix Round X:
  Fixed: X findings
  New issues from fixes: X
  Continuing...
```

### Step 3: Build Verification

Detect and run the build command:

| Stack | Build Command |
|-------|--------------|
| Node.js (TypeScript) | `npx tsc --noEmit` or `npm run build` |
| Node.js (JavaScript) | `npm run build` (if script exists) |
| Python | `python -m py_compile <main files>` |
| Go | `go build ./...` |
| Rust | `cargo build` |
| Java (Gradle) | `./gradlew build` |
| Java (Maven) | `mvn compile` |

If the build **fails**:
1. Read the error output
2. Fix the build error (likely caused by a fix in Step 2)
3. Re-run the build
4. If it fails 3 times, STOP the pipeline and report the error

Display:
```
Build: PASS (or FAIL)
```

### Step 4: Test

Run the test procedure from `/anchorscape:test`:
- Detect test framework
- Generate tests for security/performance fixes (if tests don't exist)
- Run the full test suite
- Fix failing tests (up to 3 attempts)

If tests fail after 3 attempts, continue but flag it:
```
Tests: 42 passed, 2 failed (continuing with warnings)
```

### Step 5: Full Rescan

Run the **complete** scan procedure from `/anchorscape:scan` again:
- Same Grep patterns, same scoring rules
- Save updated report to `.anchorscape/report.json`
- Compare before/after scores

Display:
```
Rescan Complete

Before: XX/100 (X critical, X high, X medium, X low)
After:  XX/100 (X critical, X high, X medium, X low)

Improvement: +XX points
```

### Step 6: Score Gate

Read the final score from `.anchorscape/report.json`:

- **Score >= 65 and zero CRITICAL**: Ready to deploy. Proceed.
- **Score 40-64 or has CRITICAL findings**: Warn the user. Ask for confirmation before deploying.
- **Score < 40**: Block deploy. Tell the user what the top issues are and that they need manual fixes.

Display:
```
Score Gate: PASS (XX/100, 0 critical, X high)
  → Ready to deploy

OR

Score Gate: WARNING (XX/100, X critical remaining)
  Top issues:
  1. [CRITICAL] SQL injection in db.ts:42 — could not auto-fix
  2. [HIGH] Missing auth on /admin routes
  → Deploy anyway? This is your call.

OR

Score Gate: BLOCKED (XX/100, X critical)
  These must be fixed manually before deploying:
  1. [CRITICAL] Hardcoded database password in config.ts
  2. [CRITICAL] No authentication on any endpoint
  → Run /anchorscape:fix to attempt another round, or fix manually.
```

### Step 7: Deploy

If the score gate passes (or user confirms):

Use the `anchorscape_deploy` MCP tool:
1. Call `anchorscape_login` if not authenticated
2. Call `anchorscape_deploy` with the project directory

Display the final result:

```
────────────────────────────────────────────
  ANCHORSCAPE PIPELINE COMPLETE
────────────────────────────────────────────

  Scan:     XX/100 → XX/100 (+XX points)
  Fixes:    X applied across X files
  Build:    PASS
  Tests:    X passed, X failed
  Deploy:   LIVE

  URL:      https://your-app.anchorscape.com

  Badge for your README:
    [![Deployed on Anchorscape](https://anchorscape.com/api/badge/your-app/status)](https://anchorscape.com)

────────────────────────────────────────────
```

## Pipeline Summary Format

At the end, always show the full pipeline summary:

```
  ┌─────────┬────────┬──────────────────────────────┐
  │ Step    │ Status │ Details                      │
  ├─────────┼────────┼──────────────────────────────┤
  │ Scan    │ DONE   │ Score: 34/100                │
  │ Fix     │ DONE   │ 12 findings fixed (3 rounds) │
  │ Build   │ PASS   │ tsc clean                    │
  │ Test    │ PASS   │ 28 passed, 0 failed          │
  │ Rescan  │ DONE   │ Score: 78/100 (+44)          │
  │ Gate    │ PASS   │ 0 critical, 2 high           │
  │ Deploy  │ LIVE   │ https://app.anchorscape.com   │
  └─────────┴────────┴──────────────────────────────┘

  Next:
    /anchorscape:dev       Iterative dev loop
    /anchorscape:promote   Promote to staging/prod
    /anchorscape:dns       Set up custom domain
    /anchorscape:status    Check deployment health
```

## Important Notes

- **Never deploy with CRITICAL findings** unless the user explicitly overrides
- **Build must pass** before deploying — broken code should never ship
- **Test failures are warnings**, not blockers — many projects have flaky tests
- **Show progress** — this is a long operation, keep the user informed at each step
- **Respect .anchorignore** — if the user has excluded files, don't scan/fix them
- If any step fails catastrophically, stop and explain what went wrong
