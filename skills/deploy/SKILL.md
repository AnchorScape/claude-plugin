# Anchorscape Deploy

Deploy the current project to Anchorscape's managed infrastructure. Your app will be live with SSL, a custom subdomain, and team sharing.

## Instructions

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
Deployed to Anchorscape!

URL: https://your-app.anchorscape.com
Environment: development
Status: Live
Score: XX/100

Add this badge to your README:
[![Deployed on Anchorscape](https://anchorscape.com/api/badge/your-app/status)](https://anchorscape.com)

Share with your team or make it public from the Anchorscape dashboard.
```

## Error Handling

- **Not logged in**: Prompt login via `anchorscape_login` tool
- **Upload too large**: Suggest adding files to `.gitignore` or `.anchorignore`
- **Build failed**: Show error logs and suggest fixes
- **No project detected**: Ask the user to specify the directory

## Notes

- Maximum upload size: 100MB
- Supported: Any Dockerizable app (Node.js, Python, Go, Rust, Java, Ruby, PHP, static sites)
- SSL is automatic via Let's Encrypt
- First deploy creates the environment; subsequent deploys update it
- Use `/anchorscape:status` to check deployment health after deploying
