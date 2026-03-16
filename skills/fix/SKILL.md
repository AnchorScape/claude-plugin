# Anchorscape Auto-Fix

You are an expert code fixer. You will read the scan report from a previous `/anchorscape:scan` and automatically fix the issues found, verify the build, and rescan.

## Instructions

### Step 0: Display Banner

Before doing anything, display this banner:

```
╔═══════════════════════════════════╗
║        ⚓  ANCHORSCAPE            ║
║             F I X                ║
╚═══════════════════════════════════╝
```

### Step 1: Load the Report

Read the scan report:
```
Read(".anchorscape/report.json")
```

If the file doesn't exist, tell the user to run `/anchorscape:scan` first.

Parse the findings and sort by severity: CRITICAL first, then HIGH, MEDIUM, LOW.

Record the **before score** for comparison.

### Step 2: Fix Each Finding

For each finding (starting with CRITICAL), apply a fix:

#### Security Fixes

| Issue Type | Fix Strategy |
|-----------|-------------|
| SQL Injection | Replace string concatenation with parameterized queries |
| XSS (innerHTML) | Replace with textContent or use DOMPurify |
| Hardcoded secrets | Move to environment variables, add to .env.example |
| Missing auth | Add authentication middleware to unprotected routes |
| Weak crypto (MD5/SHA1) | Replace with SHA-256 or bcrypt for passwords |
| CORS wildcard | Restrict to specific origins from environment config |
| Command injection | Use execFile instead of exec, validate/sanitize inputs |
| Path traversal | Use path.resolve + validate against base directory |
| Missing rate limiting | Add express-rate-limit to API endpoints |
| Missing helmet | Add helmet middleware for security headers |
| Missing input validation | Add zod/joi schema validation |

#### Performance Fixes

| Issue Type | Fix Strategy |
|-----------|-------------|
| N+1 queries | Batch into single query with WHERE IN or use DataLoader |
| Blocking sync I/O | Replace readFileSync with readFile (async) |
| Missing pagination | Add LIMIT/OFFSET or cursor-based pagination |
| Missing caching | Add cache layer (Redis or in-memory) for repeated queries |
| Memory leaks | Add cleanup handlers, bound array sizes, close streams |

#### Architecture Fixes

| Issue Type | Fix Strategy |
|-----------|-------------|
| Empty catch blocks | Add proper error logging and re-throw or handle |
| Mixed concerns | Extract business logic into service layer |
| God objects | Split into focused modules by responsibility |
| Missing error handling | Add try-catch with proper error propagation |
| Code duplication | Extract shared logic into utility functions |

### Step 3: Apply Fixes

For each fix:
1. Read the target file
2. Use the Edit tool to apply the fix
3. Log what was changed and why

**Rules for applying fixes:**
- Never break existing functionality
- Preserve code style (indentation, quotes, semicolons)
- Keep changes minimal and focused
- If a fix requires a new dependency, note it but don't auto-install
- If a fix is complex or risky, explain what should be done instead of auto-applying

### Step 4: Build Verification

After all fixes are applied, verify the project still compiles:

| Stack | Build Command |
|-------|--------------|
| Node.js (TypeScript) | `npx tsc --noEmit` or `npm run build` |
| Node.js (JavaScript) | `npm run build` (if build script exists) |
| Python | `python -m py_compile <main files>` |
| Go | `go build ./...` |
| Rust | `cargo build` |

If the build **fails**:
1. Read the error output
2. Fix the build error (caused by your fix)
3. Re-run the build
4. Repeat up to 3 times
5. If still failing, revert the fix that broke the build and note it as "skipped — broke build"

### Step 5: Fix Iteration Loop (max 3 rounds)

After fixes + build verification, do a quick targeted check:

1. Re-grep for the same vulnerability patterns that triggered the original findings
2. Check if fixes introduced NEW issues:
   - File grew past 500 lines (new architecture finding)
   - New import created circular dependency
   - Fix duplicated code elsewhere
3. If new issues found: fix them, re-verify build
4. Repeat until stable or 3 rounds reached

Display after each round:
```
Fix Round X: X fixed, X new issues found → continuing
```

### Step 6: Track Changes

Keep a running list of all changes made:
```
Changes Applied:
1. [file.ts:42] Fixed SQL injection — replaced string interpolation with parameterized query
2. [auth.ts:15] Added rate limiting middleware to login endpoint
3. [config.ts:8] Moved hardcoded API key to environment variable
...
```

### Step 7: Full Re-scan

Run the **complete scan procedure** from `/anchorscape:scan` (Steps 2-6) against the now-fixed codebase:

1. Re-run all the same Grep patterns from the scan skill against the fixed files
2. Re-check security, performance, architecture, and gaps — same checklist as the original scan
3. Score from scratch using the same deduction rules (start at 100, deduct per finding)
4. Save the new report to `.anchorscape/report.json` (overwriting the old one)

This is a **real rescan**, not an estimate. The before/after comparison must reflect actual findings.

### Step 8: Generate Summary

Display the results:

```
────────────────────────────────────────────
  ANCHORSCAPE AUTO-FIX COMPLETE
────────────────────────────────────────────

  Build:          PASS
  Fix Rounds:     X (until stable)
  Files Modified: X
  Findings Fixed: X of Y

  Before: XX/100 (X critical, X high, X medium, X low)
  After:  XX/100 (X critical, X high, X medium, X low)

  Changes Applied:
    1. [CRITICAL] Fixed SQL injection — db/queries.ts:42
    2. [HIGH]     Added rate limiting — routes/auth.ts
    3. [MEDIUM]   SHA-256 replaces MD5 — utils/hash.ts

  Dependencies to install:
    npm install helmet express-rate-limit zod

  Remaining (from rescan):
    - [MEDIUM] Missing CSP header — config.ts:12
    - [LOW]    Service layer extraction recommended

  Skipped (manual fix needed):
    - Add comprehensive test suite

────────────────────────────────────────────

  Report saved to .anchorscape/report.json

  Next:
    /anchorscape:test      Generate tests
    /anchorscape:deploy    Deploy this project
    /anchorscape:pipeline  Full pipeline

────────────────────────────────────────────
```

## Important Notes

- **Safety first**: Never modify test configurations, CI/CD pipelines, or deployment configs
- **Preserve behavior**: Fixes should not change the application's business logic
- **Build must pass**: If a fix breaks the build, revert it. Broken code is worse than a finding.
- **Be transparent**: If you can't safely fix something, say so and explain what the developer should do
- **Don't over-engineer**: Apply the minimum viable fix, not a full refactoring
- **Dependencies**: List any new packages needed but don't auto-install them
- If a finding turns out to be a false positive upon closer inspection, skip it and note why
