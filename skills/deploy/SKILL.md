# Anchorscape Deploy

Deploy the current project to Anchorscape's managed infrastructure. Your app will be live with SSL, a custom subdomain, and team sharing.

## Instructions

### Step 1: Check Authentication

Use the `anchorscape_login` MCP tool to check if the user is authenticated:

```
Use MCP tool: anchorscape_login
```

If not authenticated, the tool will open a browser for login. Wait for the user to complete authentication.

### Step 2: Ask Deploy Target

Ask the user which environment to deploy to:

**Options:**
- **Development** — For testing. Auto-generated subdomain, no custom domain.
- **Staging** — Pre-production. Share with team for review.
- **Production** — Live to the world. Custom domain support.

If the user doesn't specify, default to **development** for first deploys.

### Step 3: Deploy

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

### Step 4: Show Results

Display the deployment result:

```
Deployed to Anchorscape!

URL: https://your-app.anchorscape.com
Environment: development
Status: Live

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
