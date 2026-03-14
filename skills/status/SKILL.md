# Anchorscape Status

Check the status of your deployments on Anchorscape.

## Instructions

### Step 1: Check Authentication

Use the `anchorscape_login` MCP tool to verify the user is logged in.

### Step 2: List Projects

Use the `anchorscape_projects` MCP tool to list all projects and their environments:

```
Use MCP tool: anchorscape_projects
```

### Step 3: Show Status

If the user specified a project, use `anchorscape_status` for that project. Otherwise, show an overview of all projects.

For each project/environment, use the `anchorscape_status` MCP tool:

```
Use MCP tool: anchorscape_status
Arguments: { "projectName": "<name>" }
```

### Step 4: Display Dashboard

```
Anchorscape Deployments

Project: my-app
  production  https://my-app.anchorscape.com     LIVE    Last deploy: 2h ago
  staging     https://my-app-staging.anchor...    LIVE    Last deploy: 5h ago
  development https://my-app-dev.anchor...        LIVE    Last deploy: 1d ago

Project: api-service
  production  https://api-service.anchorscape.com LIVE    Last deploy: 3d ago
```

### Optional: Show Logs

If the user asks for logs, use the `anchorscape_logs` MCP tool:

```
Use MCP tool: anchorscape_logs
Arguments: { "environmentId": "<id>", "lines": 50 }
```

## Notes

- Status values: `live`, `building`, `failed`, `suspended`
- If a deployment is failed, show the error message and suggest `/anchorscape:deploy` to retry
- If no projects exist, suggest `/anchorscape:deploy` to create the first one
