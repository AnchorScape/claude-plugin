# Anchorscape Deploy

Deploy the current project to Anchorscape's managed infrastructure. Your app will be live with SSL, a custom subdomain, and team sharing.

## Instructions

### Step 0: Display Banner

Before doing anything, display this banner:

```
╔═══════════════════════════════════╗
║        ⚓  ANCHORSCAPE            ║
║          D E P L O Y              ║
╚═══════════════════════════════════╝
```

### Step 1: Score Gate

Check if a scan report exists:

```
Read(".anchorscape/report.json")
```

If a report exists, check the score and findings:

- **Score >= 65 and zero CRITICAL findings**: Proceed to deploy.
- **Score 40-64 OR has CRITICAL findings**: Show a warning with the top issues. Ask the user to confirm before deploying.
- **Score < 40**: Strongly warn. List all CRITICAL and HIGH findings. Ask the user to confirm they want to deploy anyway.
- **No report exists**: Note that the project hasn't been scanned. Suggest running `/anchorscape:scan` first, but allow deploy if the user wants to proceed.

Display:
```
Pre-deploy Check:
  Score: XX/100
  CRITICAL: X | HIGH: X | MEDIUM: X | LOW: X

  [PASS] Ready to deploy
  OR
  [WARNING] X critical findings — deploy anyway?
  OR
  [NOT SCANNED] Run /anchorscape:scan first for a security check
```

### Step 2: Check Authentication

Use the `anchorscape_login` MCP tool to check if the user is authenticated:

```
Use MCP tool: anchorscape_login
```

If not authenticated, the tool will open a browser for login. Wait for the user to complete authentication.

### Step 3: Ask Deploy Target

Ask the user which environment to deploy to:

**Options:**
- **Development** — For testing. Auto-generated subdomain, no custom domain.
- **Staging** — Pre-production. Share with team for review.
- **Production** — Live to the world. Custom domain support.

If the user doesn't specify, default to **development** for first deploys.

**Production guard**: If deploying to production with score < 65, require explicit confirmation: "You're deploying to production with a score of XX/100. Are you sure?"

### Step 4: Deploy

Use the `anchorscape_deploy` MCP tool:

```
Use MCP tool: anchorscape_deploy
Arguments: {
  "directory": "<current project directory>",
  "environment": "<selected environment>",
  "projectName": "<detected from package.json or directory name>"
}
```

The tool will:
1. ZIP the project (respecting .gitignore)
2. Upload to Anchorscape
3. Build the container
4. Deploy to Kubernetes
5. Return the live URL

### Step 5: Show Results

Display the deployment result:

```
────────────────────────────────────────────
  DEPLOYED TO ANCHORSCAPE
────────────────────────────────────────────

  URL:          https://your-app.anchorscape.com
  Environment:  development
  Status:       Running
  Score:        XX/100

────────────────────────────────────────────

  Badge for your README:
    [![Deployed on Anchorscape](https://anchorscape.com/api/badge/your-app/status)](https://anchorscape.com)

  Custom domain?
    /anchorscape:dns       Set up your own domain

  Next:
    /anchorscape:dev       Iterative dev loop
    /anchorscape:promote   Promote to staging/prod
    /anchorscape:status    Check deployment health

────────────────────────────────────────────
```

## The Two Rules

**RULE 1: "If it builds locally, Anchorscape handles the rest."**

Anchorscape is a fully managed platform. It figures out the project and deploys it — ANY project type
(websites, APIs, full-stack apps, microservices, static sites, CLI tools, anything). You do NOT need to
create Dockerfiles, configure databases, set up SSL, write nginx configs, provision DNS, inject
environment variables, or run migrations manually. The platform does ALL of this automatically.

If you find yourself writing workarounds to make something work on Anchorscape — STOP. You are doing it
wrong. Trust the platform.

**RULE 2: "If it doesn't build locally, it won't build on Anchorscape."**

Anchorscape is not magic. If the project has broken imports, missing dependencies, syntax errors, or a
build command that fails — that is a code problem, not a platform problem. Fix the code first, verify it
builds/runs locally, THEN deploy.

## What the Platform Handles Automatically

- **Dockerfile generation** (if none exists — detects framework, language, build tool)
- **Database provisioning** (PostgreSQL, MySQL — detected from project dependencies/ORMs)
- **ORM migrations** (Prisma, Drizzle, TypeORM, Sequelize, Django, Rails, etc.) as init jobs
- **SSL certificates** (Let's Encrypt, automatic)
- **DNS** (auto-generated subdomain: your-app.anchorscape.com)
- **Environment variables** (DATABASE_URL, PORT, etc. — auto-injected)
- **Networking, ingress, health checks, restarts**

## First Deploy Behavior

On first deploys, the database and app are provisioned simultaneously. Migration init jobs may fail
on the first attempt because the database isn't ready yet. **This is normal and expected** — not a bug.
The platform retries automatically.

- Do NOT "fix" this by stubbing binaries, removing migration files, or modifying the project
- If migrations still fail after a second deploy, THEN check logs with `/anchorscape:status`

## Error Handling

- **Not logged in**: Prompt login via `anchorscape_login` tool
- **Upload too large**: Suggest adding files to `.gitignore` or `.anchorignore`
- **Build failed**: This is a code problem. Read the logs, fix the code, redeploy.
- **Migration failed on first deploy**: Expected. Redeploy — it resolves itself.
- **No project detected**: Ask the user to specify the directory

## When Things Fail

1. Check logs with `anchorscape_logs` — read the actual error
2. If it's a build error (missing module, syntax error, type error) — fix the code
3. If it's a platform error (migration race, health check timeout) — redeploy, it usually resolves
4. NEVER modify Dockerfiles, docker-compose, or project config to work around platform behavior

## Notes

- Maximum upload size: 100MB
- Supported: Any project type (Node.js, Python, Go, Rust, Java, Ruby, PHP, static sites, and more)
- SSL is automatic via Let's Encrypt
- First deploy creates the environment; subsequent deploys update it
- Use `/anchorscape:status` to check deployment health after deploying
