# Anchorscape Security Scan

You are performing a comprehensive code audit. You will scan the current project for **security vulnerabilities**, **performance issues**, **architectural problems**, and **production readiness gaps**.

This scan is performed entirely by you using your filesystem tools. No external API calls are needed.

## Instructions

### Step 0: Display Banner

Before doing anything, display this banner:

```
────────────────────────────────────────────
     _   _  _  ___ _  _  ___  ___
    /_\ | \| |/ __| || |/ _ \| _ \
   / _ \| .` | (__| __ | (_) |   /
  /_/ \_\_|\_|\___|_||_|\___/|_|_\
           S C A N
────────────────────────────────────────────
```

### Step 1: Discover the project

Use Glob and Read to understand the project structure:

1. Find all source files: `Glob("**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}")`
2. Read `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, or equivalent dependency file
3. Identify the framework (Express, Next.js, Django, Flask, FastAPI, Rails, Spring, etc.)
4. Note the project type (API, web app, CLI, library, etc.)

### Step 2: Security Audit

Search for these vulnerability patterns using Grep:

**Injection Vulnerabilities**
- SQL injection: `Grep("query.*\\$\\{|execute.*\\$\\{|raw.*\\$\\{", glob: "*.{ts,js,py,rb,php}")`
- Command injection: `Grep("exec\\(|execSync\\(|spawn\\(.*\\$|child_process|subprocess\\.call|os\\.system", glob: "*.{ts,js,py}")`
- XSS: `Grep("innerHTML|dangerouslySetInnerHTML|v-html|\\|safe", glob: "*.{tsx,jsx,vue,html}")`
- NoSQL injection: `Grep("\\$where|\\$regex.*user|\\$gt.*user", glob: "*.{ts,js}")`

**Authentication & Authorization**
- Hardcoded secrets: `Grep("password\\s*=\\s*['\"]|api_key\\s*=\\s*['\"]|secret\\s*=\\s*['\"]|token\\s*=\\s*['\"]", glob: "*.{ts,js,py,rb,java,go}")`
- Missing auth: Check if route handlers have authentication middleware
- Weak crypto: `Grep("createHash\\(['\"]md5|createHash\\(['\"]sha1|Math\\.random", glob: "*.{ts,js}")`

**Configuration Issues**
- CORS: `Grep("cors\\(\\)|origin:\\s*['\"]\\*['\"]|Access-Control-Allow-Origin.*\\*", glob: "*.{ts,js}")`
- Missing security headers: Check for helmet, CSP, HSTS
- Debug mode in production: `Grep("DEBUG\\s*=\\s*True|debug:\\s*true", glob: "*.{py,ts,js,json}")`

**Frontend Secret Exposure** (CRITICAL - often missed)
- Vite: `Grep("define:.*JSON\\.stringify.*env", glob: "vite.config.*")`
- Webpack: `Grep("DefinePlugin.*JSON\\.stringify", glob: "webpack.config.*")`
- Any secret in client-side code that gets bundled

**Data Exposure**
- Sensitive data in logs: `Grep("console\\.log.*password|console\\.log.*token|console\\.log.*secret", glob: "*.{ts,js}")`
- Missing input validation: Check for raw user input used without validation
- Path traversal: `Grep("readFile.*req\\.|path\\.join.*req\\.", glob: "*.{ts,js}")`

**Important**: Skip false positives:
- Parameterized queries (`$1`, `?`, `:param`) are SAFE
- Environment variable reads (`process.env.X`) are generally OK
- Test files and mock data are not real vulnerabilities

### Step 3: Performance Audit

Search for performance anti-patterns:

- **N+1 queries**: `Grep("for.*await.*find|forEach.*await.*query|map.*await.*fetch", glob: "*.{ts,js,py}")`
- **Blocking operations**: `Grep("readFileSync|writeFileSync|execSync", glob: "*.{ts,js}")`
- **Missing pagination**: Large `findMany()` or `SELECT * FROM` without LIMIT
- **Memory leaks**: Unbounded arrays, missing event listener cleanup, streams not closed
- **Inefficient algorithms**: Nested loops on large datasets, repeated lookups without caching
- **Missing caching**: Database queries repeated on every request with no cache layer

### Step 4: Architecture Audit

Check for structural issues:

- **God objects**: Files with 500+ lines mixing concerns
- **Empty catch blocks**: `Grep("catch.*\\{\\s*\\}", glob: "*.{ts,js,py}")`
- **Mixed concerns**: Business logic in route handlers, SQL in controllers
- **Missing error handling**: Unhandled promise rejections, missing try-catch
- **Circular dependencies**: Cross-imports between modules
- **Code duplication**: Same logic repeated in 3+ places

### Step 5: Production Readiness Gaps

Check for missing capabilities:

| Category | What to search for |
|----------|-------------------|
| Logging | winston, pino, bunyan (not just console.log) |
| Error tracking | sentry, bugsnag, rollbar |
| Health checks | /health, /healthz, /ready endpoints |
| Rate limiting | rate-limit, throttle middleware |
| Input validation | zod, yup, joi, class-validator |
| Tests | *.test.ts, *.spec.ts, jest, vitest, pytest |
| CI/CD | .github/workflows/, .gitlab-ci.yml |
| Containerization | Dockerfile, docker-compose.yml |
| Graceful shutdown | SIGTERM, SIGINT handlers |
| Type safety | TypeScript, type annotations |

### Step 6: Generate Report

After scanning, create a structured report. Save it to `.anchorscape/report.json`:

```json
{
  "scanDate": "ISO timestamp",
  "projectName": "detected project name",
  "framework": "detected framework",
  "score": 0-100,
  "readinessLevel": "Production Grade|Ready with Minor Changes|Needs Work|Not Ready",
  "summary": "2-3 sentence executive summary",
  "findings": {
    "security": [
      {
        "id": "sec-1",
        "severity": "CRITICAL|HIGH|MEDIUM|LOW",
        "title": "Brief title",
        "description": "What the issue is",
        "file": "path/to/file.ts",
        "line": 42,
        "recommendation": "How to fix it",
        "category": "injection|auth|secrets|xss|config"
      }
    ],
    "performance": [
      {
        "id": "perf-1",
        "severity": "CRITICAL|HIGH|MEDIUM|LOW",
        "title": "Brief title",
        "description": "What the issue is",
        "file": "path/to/file.ts",
        "line": 42,
        "recommendation": "How to fix it",
        "category": "n+1|blocking|memory|caching|algorithm"
      }
    ],
    "architecture": [
      {
        "id": "arch-1",
        "severity": "CRITICAL|HIGH|MEDIUM|LOW",
        "title": "Brief title",
        "description": "What the issue is",
        "file": "path/to/file.ts",
        "line": 42,
        "recommendation": "How to fix it",
        "category": "solid|coupling|error-handling|duplication"
      }
    ],
    "gaps": [
      {
        "id": "gap-1",
        "priority": "high|medium|low",
        "title": "What's missing",
        "category": "security|observability|resilience|performance|maintainability|infrastructure",
        "currentState": "missing|partial|present",
        "recommendation": "What to add",
        "effort": "low|medium|high"
      }
    ]
  },
  "stats": {
    "filesScanned": 0,
    "totalFindings": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "gapsCoverage": 0
  }
}
```

### Scoring Guide

Start at 100, deduct points:
- Each CRITICAL finding: -15 points
- Each HIGH finding: -8 points
- Each MEDIUM finding: -3 points
- Each LOW finding: -1 point
- Gap coverage below 50%: -10 points
- No tests at all: -10 points
- No error handling: -5 points

Minimum score is 0. Round to nearest integer.

**Readiness Levels:**
- 85-100: Production Grade
- 65-84: Ready with Minor Changes
- 40-64: Needs Work
- 0-39: Not Ready

### Step 7: Display Summary

After saving the report, display a summary to the user:

```
────────────────────────────────────────────
  ANCHORSCAPE SCAN COMPLETE
────────────────────────────────────────────

  Project:    <name>
  Framework:  <detected>
  Score:      XX/100 — [Readiness Level]

  Findings:
    CRITICAL:  X
    HIGH:      X
    MEDIUM:    X
    LOW:       X

  Top Issues:
    1. [CRITICAL] <title> — file.ts:42
    2. [HIGH]     <title> — file.ts:15
    3. [MEDIUM]   <title> — file.ts:88

  Production Readiness: XX% gap coverage

────────────────────────────────────────────

  Report saved to .anchorscape/report.json

  Next:
    /anchorscape:fix       Auto-fix issues
    /anchorscape:deploy    Deploy this project
    /anchorscape:pipeline  Full scan-fix-deploy

────────────────────────────────────────────
```

## Important Notes

- **Quality over quantity**: Only report issues you're confident about with evidence
- **No duplicates**: Each finding must be unique
- **Be specific**: Include exact file paths and line numbers
- **Skip test files**: Don't flag issues in test/mock files unless they test production security
- **Consider context**: A personal project has different standards than an enterprise API
- Ensure the `.anchorscape/` directory exists before writing the report
