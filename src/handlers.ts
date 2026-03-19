/**
 * MCP Tool Handlers — Deploy-focused
 *
 * Handles deploy, auth, status, logs, and project listing.
 * Reuses patterns from the CLI (cli/src/) but adapted for MCP context.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import archiver from 'archiver';

// ============================================================================
// STDERR FORMATTING (Rich ANSI output visible during MCP tool execution)
// ============================================================================

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

function banner(title: string): void {
  console.error('');
  console.error(`${C.cyan}╔═══════════════════════════════════════════╗${C.reset}`);
  console.error(`${C.cyan}║${C.reset}   ${C.bold}${C.white}⚓  ANCHORSCAPE${C.reset}                          ${C.cyan}║${C.reset}`);
  console.error(`${C.cyan}║${C.reset}      ${C.bold}${C.white}${title}${C.reset}${' '.repeat(Math.max(0, 37 - title.length))}${C.cyan}║${C.reset}`);
  console.error(`${C.cyan}╚═══════════════════════════════════════════╝${C.reset}`);
  console.error('');
}

function logStep(step: number, total: number, message: string): void {
  console.error(`${C.blue}  [${step}/${total}]${C.reset} ${message}`);
}

function logStatus(icon: string, message: string): void {
  console.error(`${C.blue}  ${icon}${C.reset}  ${message}`);
}

function logSuccess(message: string): void {
  console.error(`${C.green}  ✓${C.reset}  ${message}`);
}

function logError(message: string): void {
  console.error(`${C.red}  ✗${C.reset}  ${message}`);
}

function logWarn(message: string): void {
  console.error(`${C.yellow}  ⚠${C.reset}  ${message}`);
}

function logProgress(label: string, detail?: string): void {
  const detailStr = detail ? ` ${C.dim}${detail}${C.reset}` : '';
  console.error(`${C.cyan}  ›${C.reset}  ${label}${detailStr}`);
}

function logDivider(): void {
  console.error(`${C.dim}  ${'─'.repeat(43)}${C.reset}`);
}

// ============================================================================
// CREDENTIALS
// ============================================================================

interface Credentials {
  token: string;
  email: string;
  name: string;
  expiresAt: string;
  apiUrl: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'anchorscape');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

function loadCredentials(): Credentials | null {
  try {
    const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

function isTokenExpired(creds: Credentials): boolean {
  return new Date(creds.expiresAt) < new Date();
}

const ALLOWED_API_HOSTS = ['anchorscape.com', 'www.anchorscape.com', 'localhost'];

function getBaseUrl(): string {
  const url = process.env.ANCHOR_API_URL || loadCredentials()?.apiUrl || 'https://anchorscape.com';
  // Validate the URL to prevent SSRF
  try {
    const parsed = new URL(url);
    if (!ALLOWED_API_HOSTS.includes(parsed.hostname) && !parsed.hostname.endsWith('.anchorscape.com')) {
      return 'https://anchorscape.com';
    }
    // Enforce HTTPS for non-localhost
    if (parsed.hostname !== 'localhost' && parsed.protocol !== 'https:') {
      return 'https://anchorscape.com';
    }
  } catch {
    return 'https://anchorscape.com';
  }
  return url;
}

function requireAuth(): Credentials {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error('Not logged in. Use the anchorscape_login tool first.');
  }
  if (isTokenExpired(creds)) {
    throw new Error('Session expired. Use the anchorscape_login tool to re-authenticate.');
  }
  return creds;
}

// ============================================================================
// HTTP CLIENT (with timeouts and proper error handling)
// ============================================================================

const FETCH_TIMEOUT = 15_000; // 15s per request
const UPLOAD_TIMEOUT = 120_000; // 2min for uploads (large zips)

async function apiRequest(method: string, urlPath: string, options?: {
  body?: unknown;
  headers?: Record<string, string>;
  noAuth?: boolean;
  timeout?: number;
}): Promise<Response> {
  const url = `${getBaseUrl()}${urlPath}`;
  const headers: Record<string, string> = { ...options?.headers };

  if (!options?.noAuth) {
    const creds = requireAuth();
    headers['Authorization'] = `Bearer ${creds.token}`;
  }

  if (options?.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const timeout = options?.timeout ?? FETCH_TIMEOUT;
  const res = await fetch(url, {
    method,
    headers,
    body: options?.body instanceof FormData
      ? options.body as any
      : options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });

  return res;
}

async function apiJSON(method: string, urlPath: string, options?: {
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}): Promise<any> {
  const res = await apiRequest(method, urlPath, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || (data as any).message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ============================================================================
// ZIP
// ============================================================================

// Always exclude regardless of .gitignore
const ALWAYS_EXCLUDE = [
  '.git',
  'node_modules',
  '.anchor',
  '.anchorscape',
  '.claude',
  '.claude-plugin',
  '.DS_Store',
  'Thumbs.db',
  '__MACOSX',
  '__pycache__',
  '.venv',
  'venv',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'coverage',
  'generated',        // Prisma client, GraphQL codegen, etc — rebuilt at build time
  '.prisma',
  '.turbo',
  '.parcel-cache',
  '.cache',
  '.env',
  '.env.local',
  '.env.production',
  '.env.staging',
  '.env.development',
  '.env.test',
];

function shouldExclude(relativePath: string, isDir: boolean, gitignorePatterns: string[]): boolean {
  const parts = relativePath.split('/');
  const name = parts[parts.length - 1];

  // Check always-exclude list (exact match and .env.* pattern)
  if (ALWAYS_EXCLUDE.includes(name)) return true;
  if (name.startsWith('.env.')) return true;

  // Check gitignore patterns (basic implementation)
  for (const pattern of gitignorePatterns) {
    if (!pattern || pattern.startsWith('#')) continue;
    const trimmed = pattern.trim();
    if (!trimmed) continue;

    // Simple matching: exact name, or wildcard
    const isNegation = trimmed.startsWith('!');
    const pat = isNegation ? trimmed.slice(1) : trimmed;

    // Directory-only pattern (ends with /)
    if (pat.endsWith('/')) {
      if (isDir && name === pat.slice(0, -1)) return !isNegation;
      continue;
    }

    // Exact match
    if (name === pat || relativePath === pat) {
      return !isNegation;
    }

    // Wildcard match (*.ext)
    if (pat.startsWith('*.')) {
      const ext = pat.slice(1);
      if (name.endsWith(ext)) return !isNegation;
    }
  }

  return false;
}

async function zipDirectory(dir: string): Promise<{ buffer: Buffer; fileCount: number }> {
  // Load gitignore patterns
  let gitignorePatterns: string[] = [];
  for (const ignoreFile of ['.gitignore', '.anchorignore']) {
    try {
      const content = fs.readFileSync(path.join(dir, ignoreFile), 'utf-8');
      gitignorePatterns.push(...content.split('\n'));
    } catch { /* file doesn't exist */ }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let fileCount = 0;

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => {
      resolve({ buffer: Buffer.concat(chunks), fileCount });
    });

    const addDir = (currentDir: string, prefix: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (shouldExclude(relativePath, entry.isDirectory(), gitignorePatterns)) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        // Skip symlinks to prevent path traversal attacks
        if (entry.isSymbolicLink()) {
          continue;
        }

        if (entry.isDirectory()) {
          addDir(fullPath, relativePath);
        } else if (entry.isFile()) {
          // Verify resolved path is still within the root directory
          const resolved = fs.realpathSync(fullPath);
          if (!resolved.startsWith(fs.realpathSync(dir) + path.sep) && resolved !== fs.realpathSync(dir)) {
            continue;
          }
          archive.file(fullPath, { name: relativePath });
          fileCount++;
        }
      }
    };

    addDir(dir, '');
    archive.finalize();
  });
}

// ============================================================================
// HANDLERS
// ============================================================================

// ============================================================================
// LOCAL PROJECT STATE (.anchorscape/project.json)
// ============================================================================

interface AnchorState {
  environmentId: string;
  projectName: string;
  environmentName: string;
  url?: string;
  createdAt: string;
}

function loadAnchorState(directory: string): AnchorState | null {
  try {
    const statePath = path.join(directory, '.anchorscape', 'project.json');
    const data = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(data) as AnchorState;
  } catch {
    return null;
  }
}

function saveAnchorState(directory: string, state: AnchorState): void {
  const stateDir = path.join(directory, '.anchorscape');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'project.json'),
    JSON.stringify(state, null, 2)
  );

  // Auto-add .anchorscape to .gitignore if not already there
  const gitignorePath = path.join(directory, '.gitignore');
  try {
    const existing = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';
    if (!existing.includes('.anchorscape')) {
      const newline = existing.endsWith('\n') || existing === '' ? '' : '\n';
      fs.appendFileSync(gitignorePath, `${newline}.anchorscape/\n`);
    }
  } catch { /* best effort */ }
}

/**
 * Deploy a project directory
 */
export async function handleDeploy(
  directory: string,
  environment: 'development' | 'staging' | 'production' = 'development',
  projectName?: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const totalSteps = 6;

  banner('D E P L O Y');

  // Validate directory
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    logError(`Directory not found: ${directory}`);
    throw new Error(`Directory not found: ${directory}`);
  }

  // Check auth
  const creds = requireAuth();
  logSuccess(`Authenticated as ${creds.email}`);

  // Detect project name
  if (!projectName) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf-8'));
      projectName = pkg.name?.replace(/^@[^/]+\//, '') || path.basename(directory);
    } catch {
      projectName = path.basename(directory);
    }
  }

  // Clean project name for K8s compatibility
  const cleanName = (projectName || path.basename(directory))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  projectName = cleanName;

  // ── Step 1: Package ──
  logStep(1, totalSteps, 'Packaging project...');
  if (onProgress) onProgress('Packaging project...');

  const { buffer, fileCount } = await zipDirectory(directory);
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  logSuccess(`Packaged ${C.bold}${fileCount}${C.reset} files (${sizeMB} MB)`);

  if (buffer.length > 100 * 1024 * 1024) {
    logError(`Project too large: ${sizeMB} MB (max 100 MB)`);
    throw new Error(`Project is too large (${sizeMB} MB, max 100 MB). Add large files to .gitignore or .anchorignore.`);
  }

  // ── Step 2: Resolve Environment ──
  logStep(2, totalSteps, 'Resolving environment...');
  if (onProgress) onProgress('Resolving environment...');

  let environmentId: string | null = null;
  let isRedeployment = false;

  // 1) Check local anchor state (fastest, unambiguous)
  const anchorState = loadAnchorState(directory);
  if (anchorState?.environmentId) {
    try {
      await apiJSON('GET', `/api/k3s/environments/${anchorState.environmentId}`);
      environmentId = anchorState.environmentId;
      isRedeployment = true;
      logSuccess(`Reusing environment from .anchorscape/project.json`);
    } catch {
      logWarn('Previous environment was deleted, creating new one');
    }
  }

  // 2) Fallback: search user's environments by displayName
  if (!environmentId) {
    try {
      const data = await apiJSON('GET', '/api/k3s/environments');
      const envs = data.environments || [];
      const match = envs.find((e: any) => e.displayName === projectName);
      if (match) {
        environmentId = match.id;
        isRedeployment = true;
        logSuccess(`Found existing environment: ${projectName}`);
      }
    } catch { /* first deploy, no existing environments */ }
  }

  if (!isRedeployment) {
    logProgress('First deploy', 'new environment will be created');
  }

  // ── Step 3: Upload ──
  logStep(3, totalSteps, `Uploading ${sizeMB} MB to Anchorscape...`);
  if (onProgress) onProgress(`Uploading ${sizeMB} MB...`);

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)]), 'project.zip');

  if (environmentId) {
    formData.append('environmentId', environmentId);
  } else {
    formData.append('autoCreateEnvironment', 'true');
    formData.append('displayName', projectName);
    formData.append('environmentName', environment);
  }

  const uploadRes = await apiRequest('POST', '/api/k3s/deploy/upload', {
    body: formData,
    timeout: UPLOAD_TIMEOUT, // 2 min for large uploads
  });

  if (!uploadRes.ok) {
    const data = await uploadRes.json().catch(() => ({}));
    const errMsg = (data as any).error || (data as any).message || `HTTP ${uploadRes.status}`;
    logError(`Upload failed: ${errMsg}`);
    throw new Error(`Upload failed: ${errMsg}`);
  }

  const deployData = await uploadRes.json() as {
    deploymentId: string;
    message: string;
    streamUrl?: string;
    environmentId?: string;
  };

  logSuccess('Upload complete — build queued');

  // Save environment ID locally for future deploys
  const resolvedEnvId = deployData.environmentId || environmentId;
  if (resolvedEnvId) {
    saveAnchorState(directory, {
      environmentId: resolvedEnvId,
      projectName: projectName!,
      environmentName: environment,
      createdAt: anchorState?.createdAt || new Date().toISOString(),
    });
  }

  // ── Step 4-6: Build → Deploy → Verify (polling) ──
  logStep(4, totalSteps, 'Building container image...');
  if (onProgress) onProgress('Building container image...');

  const deploymentId = deployData.deploymentId;
  const maxWait = 300_000; // 5 minutes
  const pollInterval = 2_000; // 2 seconds (was 5s — much more responsive now)
  const startTime = Date.now();
  const maxConsecutiveErrors = 5; // abort after 5 consecutive network failures

  let finalStatus = 'unknown';
  let finalUrl = '';
  let errorMessage = '';
  let buildLogs = '';
  let lastLoggedStatus = '';
  let lastLoggedStep = '';
  let consecutiveErrors = 0;
  const progressLog: string[] = [];

  // Status → step mapping for numbered progress
  const statusStepMap: Record<string, { step: number; label: string; icon: string }> = {
    queued: { step: 4, label: 'Queued — waiting for build slot', icon: '⏳' },
    building: { step: 4, label: 'Building container image', icon: '🔨' },
    pushing: { step: 5, label: 'Pushing image to registry', icon: '📦' },
    deploying: { step: 5, label: 'Deploying to cluster', icon: '🚀' },
    verifying: { step: 6, label: 'Running health checks', icon: '🩺' },
    troubleshooting: { step: 6, label: 'Anchorton analyzing failure', icon: '🔍' },
  };

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const statusRes = await apiJSON('GET', `/api/k3s/deployments/${deploymentId}`);
      consecutiveErrors = 0; // Reset on success

      const dep = statusRes.deployment;
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Log status changes with rich formatting
      if (dep.status !== lastLoggedStatus) {
        lastLoggedStatus = dep.status;
        const info = statusStepMap[dep.status];
        if (info) {
          logStep(info.step, totalSteps, `${info.label}...`);
          progressLog.push(`${elapsed}s — ${info.label}`);
          if (onProgress) onProgress(`[${info.step}/${totalSteps}] ${info.label}`);
        } else {
          logProgress(dep.status, `${elapsed}s`);
          progressLog.push(`${elapsed}s — ${dep.status}`);
          if (onProgress) onProgress(dep.status);
        }
      }

      // Log currentStep changes (granular progress within a status)
      if (dep.currentStep && dep.currentStep !== lastLoggedStep) {
        lastLoggedStep = dep.currentStep;
        logProgress(dep.currentStep, `${elapsed}s`);
        progressLog.push(`  ${elapsed}s — ${dep.currentStep}`);
        if (onProgress) onProgress(dep.currentStep);
      }

      if (dep.status === 'completed') {
        finalStatus = 'completed';
        finalUrl = dep.externalUrl || dep.deployedUrls?.[0] || `https://${projectName}.anchorscape.com`;
        break;
      }

      if (dep.status === 'failed') {
        finalStatus = 'failed';
        errorMessage = dep.errorMessage || 'Unknown error';
        buildLogs = dep.buildLogs || '';
        break;
      }

      // Still building/deploying — continue polling
    } catch (err: unknown) {
      consecutiveErrors++;
      const errMsg = err instanceof Error ? err.message : String(err);

      // Distinguish transient network errors from real API errors
      const isTimeout = errMsg.includes('TimeoutError') || errMsg.includes('aborted');
      const isNetworkError = isTimeout || errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed');

      if (isNetworkError) {
        logWarn(`Network issue (attempt ${consecutiveErrors}/${maxConsecutiveErrors}): ${isTimeout ? 'request timed out' : 'connection failed'}`);
      } else {
        // Real API error (auth failed, 404, 500, etc.) — fail fast
        logError(`API error: ${errMsg}`);
        finalStatus = 'failed';
        errorMessage = errMsg;
        break;
      }

      if (consecutiveErrors >= maxConsecutiveErrors) {
        logError(`${maxConsecutiveErrors} consecutive network failures — aborting`);
        finalStatus = 'failed';
        errorMessage = `Lost connection to Anchorscape after ${maxConsecutiveErrors} retries. Check your network and try /anchorscape:status to see if the deployment completed.`;
        break;
      }
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // ── Results ──
  logDivider();

  if (finalStatus === 'completed') {
    // Update local state with URL
    if (resolvedEnvId) {
      saveAnchorState(directory, {
        environmentId: resolvedEnvId,
        projectName: projectName!,
        environmentName: environment,
        url: finalUrl,
        createdAt: anchorState?.createdAt || new Date().toISOString(),
      });
    }

    // Rich success output to stderr
    console.error('');
    console.error(`${C.green}${C.bold}  ✓  DEPLOYED SUCCESSFULLY${C.reset}`);
    console.error('');
    console.error(`  ${C.bold}URL:${C.reset}          ${C.cyan}${finalUrl}${C.reset}`);
    console.error(`  ${C.bold}Project:${C.reset}      ${projectName}`);
    console.error(`  ${C.bold}Environment:${C.reset}  ${environment}`);
    console.error(`  ${C.bold}Files:${C.reset}        ${fileCount} (${sizeMB} MB)`);
    console.error(`  ${C.bold}Build time:${C.reset}   ${elapsed}s`);
    console.error('');
    logDivider();
    console.error('');
    console.error(`  ${C.dim}Next:${C.reset}`);
    console.error(`    ${C.cyan}/anchorscape:status${C.reset}    Check deployment health`);
    console.error(`    ${C.cyan}/anchorscape:dns${C.reset}       Set up custom domain`);
    console.error(`    ${C.cyan}/anchorscape:dev${C.reset}       Iterative dev loop`);
    console.error(`    ${C.cyan}/anchorscape:promote${C.reset}   Promote to staging/prod`);
    console.error('');

    // Tool result (what Claude sees)
    return [
      '# Deployed Successfully',
      '',
      `**URL:** ${finalUrl}`,
      `**Environment:** ${environment}`,
      `**Project:** ${projectName}`,
      `**Files:** ${fileCount} (${sizeMB} MB)`,
      `**Build time:** ${elapsed}s`,
      '',
      '## Timeline',
      ...progressLog.map(l => `- ${l}`),
      '',
      '## README Badge',
      '```markdown',
      `[![Deployed on Anchorscape](https://anchorscape.com/api/badge/${projectName}/status)](${finalUrl})`,
      '```',
      '',
      'Use `/anchorscape:status` to check deployment health.',
    ].join('\n');
  } else if (finalStatus === 'failed') {
    // Rich failure output to stderr
    console.error('');
    console.error(`${C.red}${C.bold}  ✗  DEPLOYMENT FAILED${C.reset}`);
    console.error('');
    console.error(`  ${C.bold}Error:${C.reset}   ${errorMessage}`);
    console.error(`  ${C.bold}Elapsed:${C.reset} ${elapsed}s`);
    console.error('');

    if (progressLog.length > 0) {
      console.error(`  ${C.bold}Timeline:${C.reset}`);
      for (const entry of progressLog) {
        console.error(`    ${C.dim}${entry}${C.reset}`);
      }
      console.error('');
    }

    if (buildLogs) {
      const logLines = buildLogs.split('\n').filter((l: string) => l.trim());
      const lastLines = logLines.slice(-20);
      console.error(`  ${C.bold}Build logs (last ${lastLines.length} lines):${C.reset}`);
      for (const line of lastLines) {
        console.error(`    ${C.dim}${line}${C.reset}`);
      }
      console.error('');
    }

    logDivider();
    console.error('');

    // Tool result with full logs
    const errorLines: string[] = [
      '# Deployment Failed',
      '',
      `**Error:** ${errorMessage}`,
      `**Elapsed:** ${elapsed}s`,
      '',
    ];

    if (progressLog.length > 0) {
      errorLines.push('## Deploy Timeline');
      for (const entry of progressLog) {
        errorLines.push(`- ${entry}`);
      }
      errorLines.push('');
    }

    if (buildLogs) {
      const logLines = buildLogs.split('\n').filter((l: string) => l.trim());
      // Show up to 100 lines (was 30 — way too little)
      const lastLines = logLines.slice(-100);
      errorLines.push(`## Build Logs (last ${lastLines.length} lines)`);
      errorLines.push('```');
      errorLines.push(...lastLines);
      errorLines.push('```');
      errorLines.push('');

      // Suggest fix based on common error patterns
      const logsText = buildLogs.toLowerCase();
      if (logsText.includes('npm install') || logsText.includes('npm ci') || logsText.includes('package-lock.json')) {
        errorLines.push('**Suggestion:** Dependency installation failed. Check your package.json for invalid versions or missing packages.');
      } else if (logsText.includes('dockerfile') || logsText.includes('copy failed') || logsText.includes('no such file')) {
        errorLines.push('**Suggestion:** A file referenced in the Dockerfile was not found. Check that all required files are included in the project (not in .gitignore).');
      } else if (logsText.includes('syntax error') || logsText.includes('syntaxerror') || logsText.includes('unexpected token')) {
        errorLines.push('**Suggestion:** Build failed due to a syntax error. Check the logs above for the file and line number.');
      } else if (logsText.includes('out of memory') || logsText.includes('exit code 137')) {
        errorLines.push('**Suggestion:** Build ran out of memory. Try reducing build parallelism (e.g., NODE_OPTIONS=--max-old-space-size=512).');
      } else if (logsText.includes('permission denied') || logsText.includes('eacces')) {
        errorLines.push('**Suggestion:** Permission error during build. Check file permissions or avoid writing to read-only paths.');
      } else {
        errorLines.push('**Suggestion:** Review the build logs above for the root cause. Common fixes: ensure all dependencies are in package.json, all referenced files exist, and the start command is correct.');
      }
    } else {
      errorLines.push('**Suggestion:** No build logs captured. The build may have failed before starting (e.g., ZIP upload issue, malware scan, or Kubernetes job creation failure).');
    }

    throw new Error(errorLines.join('\n'));
  } else {
    // Timeout — this is NOT a success. Be clear about it.
    console.error('');
    console.error(`${C.yellow}${C.bold}  ⚠  DEPLOYMENT TIMED OUT${C.reset}`);
    console.error('');
    console.error(`  ${C.bold}Status:${C.reset}   Build still running after ${elapsed}s`);
    console.error(`  ${C.bold}Deploy ID:${C.reset} ${deploymentId}`);
    console.error('');
    console.error(`  The deployment may still complete. Check with:`);
    console.error(`    ${C.cyan}/anchorscape:status${C.reset}`);
    console.error('');
    logDivider();
    console.error('');

    if (progressLog.length > 0) {
      console.error(`  ${C.bold}Last known progress:${C.reset}`);
      for (const entry of progressLog.slice(-5)) {
        console.error(`    ${C.dim}${entry}${C.reset}`);
      }
      console.error('');
    }

    // Tool result — be honest that this timed out
    const lines = [
      '# Deployment Timed Out',
      '',
      `The deployment has been running for ${elapsed}s and hasn't completed yet.`,
      `This does **not** mean it failed — large builds can take longer.`,
      '',
      `**Deployment ID:** ${deploymentId}`,
      `**Project:** ${projectName}`,
      `**Environment:** ${environment}`,
      `**Last status:** ${lastLoggedStatus || 'unknown'}`,
      '',
    ];

    if (progressLog.length > 0) {
      lines.push('## Progress so far');
      for (const entry of progressLog) {
        lines.push(`- ${entry}`);
      }
      lines.push('');
    }

    lines.push('## What to do');
    lines.push('- Run `/anchorscape:status` to check if deployment completed');
    lines.push('- Run `anchorscape_logs` tool to view build output');
    lines.push('- If stuck, try deploying again with `/anchorscape:deploy`');

    return lines.join('\n');
  }
}

/**
 * Login via browser OAuth (polling-based — works in WSL2, SSH, Docker, etc.)
 */
export async function handleLogin(apiUrl?: string): Promise<string> {
  let baseUrl = apiUrl || process.env.ANCHOR_API_URL || 'https://anchorscape.com';

  // Validate apiUrl against the same allowlist used by getBaseUrl()
  try {
    const parsed = new URL(baseUrl);
    if (!ALLOWED_API_HOSTS.includes(parsed.hostname) && !parsed.hostname.endsWith('.anchorscape.com')) {
      baseUrl = 'https://anchorscape.com';
    }
    // Enforce HTTPS for non-localhost
    if (parsed.hostname !== 'localhost' && parsed.protocol !== 'https:') {
      baseUrl = 'https://anchorscape.com';
    }
  } catch {
    baseUrl = 'https://anchorscape.com';
  }

  banner('L O G I N');

  // Check if already logged in
  const existing = loadCredentials();
  if (existing && !isTokenExpired(existing)) {
    logSuccess(`Already logged in as ${C.bold}${existing.email}${C.reset}`);
    return [
      `Already logged in as **${existing.email}**`,
      `API: ${existing.apiUrl}`,
      '',
      'To switch accounts, delete ~/.config/anchorscape/credentials.json and run this tool again.',
    ].join('\n');
  }

  // Create a pending auth session on the server
  logStep(1, 3, 'Creating auth session...');
  const sessionRes = await fetch(`${baseUrl}/api/auth/cli/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!sessionRes.ok) {
    logError('Failed to create auth session');
    throw new Error('Failed to create auth session. Is the Anchorscape server reachable?');
  }

  const { sessionId } = await sessionRes.json() as { sessionId: string };
  const authUrl = `${baseUrl}/cli/auth?session=${sessionId}`;

  // Try to open browser (WSL/macOS/Linux/Windows)
  logStep(2, 3, 'Opening browser...');
  import('child_process').then(({ execFile }) => {
    const isWSL = (() => {
      try {
        return fs.readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');
      } catch {
        return false;
      }
    })();

    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', authUrl], { timeout: 5000 }, () => {});
    } else if (isWSL) {
      execFile('wslview', [authUrl], { timeout: 5000 }, (err) => {
        if (err) {
          execFile('cmd.exe', ['/c', 'start', '', authUrl], { timeout: 5000 }, () => {});
        }
      });
    } else if (process.platform === 'darwin') {
      execFile('open', [authUrl], { timeout: 5000 }, () => {});
    } else {
      execFile('xdg-open', [authUrl], { timeout: 5000 }, () => {});
    }
  }).catch(() => {});

  console.error(`  ${C.bold}Auth URL:${C.reset} ${C.cyan}${authUrl}${C.reset}`);
  console.error('');

  // Poll for completion
  logStep(3, 3, 'Waiting for browser authorization...');
  const maxWait = 120_000; // 2 minutes
  const pollInterval = 2_000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const statusRes = await fetch(
        `${baseUrl}/api/auth/cli/session/${sessionId}/status`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
      );

      if (!statusRes.ok) continue;

      const data = await statusRes.json() as {
        status: 'pending' | 'completed' | 'expired';
        token?: string;
        email?: string;
        name?: string;
        expiresAt?: string;
      };

      if (data.status === 'completed' && data.token) {
        saveCredentials({
          token: data.token,
          email: data.email || '',
          name: data.name || '',
          expiresAt: data.expiresAt || '',
          apiUrl: baseUrl,
        });

        logSuccess(`Logged in as ${C.bold}${data.email}${C.reset}`);

        return [
          `Logged in as **${data.email}**`,
          '',
          'You can now use anchorscape_deploy to deploy your projects.',
        ].join('\n');
      }

      if (data.status === 'expired') {
        break;
      }

      // status === 'pending' — keep polling
    } catch {
      // Network hiccup — keep polling (login polling is inherently transient)
    }
  }

  // Timeout or expired
  logWarn('Login was not completed in time');
  return [
    '**Login was not completed in time.**',
    '',
    'Please open this URL in your browser to log in:',
    '',
    authUrl,
    '',
    'After authorizing, run this tool again.',
  ].join('\n');
}

/**
 * Check deployment status
 */
export async function handleStatus(
  projectName?: string,
  environmentId?: string,
): Promise<string> {
  requireAuth();

  banner('S T A T U S');

  // If specific environment given
  if (environmentId) {
    const data = await apiJSON('GET', `/api/k3s/environments/${environmentId}`);
    const env = data.environment;
    return formatEnvironmentStatus(env);
  }

  // List user's environments
  const data = await apiJSON('GET', '/api/k3s/environments');
  const environments = data.environments || [];

  if (environments.length === 0) {
    logWarn('No deployments found');
    return 'No deployments found. Use anchorscape_deploy to deploy your first project.';
  }

  // Filter by project name if given
  const filtered = projectName
    ? environments.filter((e: any) => e.displayName === projectName || e.name === projectName)
    : environments;

  if (filtered.length === 0) {
    const names = environments.map((e: any) => e.displayName || e.name);
    return `No environment named "${projectName}" found. Available: ${names.join(', ')}`;
  }

  // Rich stderr output
  for (const env of filtered) {
    const status = env.activeDeploymentId ? 'LIVE' : 'IDLE';
    const statusColor = status === 'LIVE' ? C.green : C.yellow;
    const url = env.customDomain
      ? `https://${env.customDomain}`
      : env.subdomain
        ? `https://${env.subdomain}.anchorscape.com`
        : 'No URL yet';
    console.error(`  ${C.bold}${env.displayName || env.name}${C.reset}  ${statusColor}${status}${C.reset}`);
    console.error(`  ${C.dim}${url}${C.reset}`);
    console.error('');
  }

  // Tool result
  const lines: string[] = ['# Anchorscape Deployments', ''];

  for (const env of filtered) {
    const status = env.activeDeploymentId ? 'LIVE' : 'IDLE';
    const url = env.customDomain
      ? `https://${env.customDomain}`
      : env.subdomain
        ? `https://${env.subdomain}.anchorscape.com`
        : 'No URL yet';
    lines.push(`## ${env.displayName || env.name}`);
    lines.push(`  **URL:** ${url}`);
    lines.push(`  **Status:** ${status}`);
    lines.push(`  **Environment ID:** ${env.id}`);
    lines.push('');
  }

  lines.push('Use anchorscape_logs with an environment ID to view logs.');
  return lines.join('\n');
}

function formatEnvironmentStatus(env: any): string {
  const url = env.customDomain
    ? `https://${env.customDomain}`
    : `https://${env.subdomain}.anchorscape.com`;

  const status = env.activeDeploymentId ? 'LIVE' : 'IDLE';
  const statusColor = status === 'LIVE' ? C.green : C.yellow;

  // Rich stderr
  console.error(`  ${C.bold}${env.displayName || env.name}${C.reset}  ${statusColor}${status}${C.reset}`);
  console.error(`  ${C.cyan}${url}${C.reset}`);
  console.error(`  ${C.dim}Tier: ${env.resourceTier} | Port: ${env.appPort} | Replicas: ${env.replicas}${C.reset}`);
  console.error('');

  return [
    `## ${env.displayName || env.name}`,
    '',
    `**URL:** ${url}`,
    `**Status:** ${status}`,
    `**Tier:** ${env.resourceTier}`,
    `**Port:** ${env.appPort}`,
    `**Replicas:** ${env.replicas}`,
    `**Environment ID:** ${env.id}`,
    env.customDomain ? `**Custom Domain:** ${env.customDomain}` : '',
    '',
    `Created: ${env.createdAt}`,
    `Updated: ${env.updatedAt}`,
  ].filter(Boolean).join('\n');
}

/**
 * Get logs for a deployment
 */
export async function handleLogs(
  environmentId: string,
  lines: number = 50,
): Promise<string> {
  requireAuth();

  banner('L O G S');

  // Clamp lines to prevent abuse
  const clampedLines = Math.max(1, Math.min(lines, 500));

  logStep(1, 1, `Fetching last ${clampedLines} lines...`);

  const data = await apiJSON('GET', `/api/k3s/environments/${environmentId}/logs?lines=${clampedLines}`);

  if (!data.logs || data.logs.length === 0) {
    logWarn('No logs available');
    return 'No logs available for this environment.';
  }

  logSuccess(`Retrieved ${data.logs.split('\n').length} log lines`);

  return [
    `# Logs (last ${clampedLines} lines)`,
    `Environment: ${environmentId}`,
    '',
    '```',
    data.logs,
    '```',
  ].join('\n');
}

/**
 * List all projects
 */
export async function handleProjects(): Promise<string> {
  return handleStatus();
}
