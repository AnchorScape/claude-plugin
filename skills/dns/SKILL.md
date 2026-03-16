# Anchorscape DNS — Custom Domain Setup

Guide the user through connecting their custom domain to their Anchorscape deployment. This is the "last mile" — getting from `app.anchorscape.com` to `app.yourdomain.com`.

## Instructions

### Step 1: Check Deployment

Verify the user has an active deployment:

1. Use `anchorscape_projects` MCP tool to list projects
2. Use `anchorscape_status` MCP tool for the target project
3. Get the current anchorscape.com subdomain

If no deployment exists:
```
  No active deployment found.

  Deploy first:
    /anchorscape:deploy     Deploy your project
    /anchorscape:dev        Start a dev loop

  Then come back here for DNS setup.
```

### Step 2: Ask About Their Domain

Ask the user:
1. What custom domain do they want to use? (e.g., `app.example.com`, `example.com`)
2. Who is their DNS provider/registrar?

Display current state:
```
────────────────────────────────────────────
  ANCHORSCAPE DNS SETUP
────────────────────────────────────────────

  Project:        <name>
  Current URL:    https://<app>.anchorscape.com
  Target Domain:  <waiting for input>

────────────────────────────────────────────

  What domain do you want to point to this
  deployment?

  Examples:
    app.example.com      (subdomain)
    www.example.com      (www subdomain)
    example.com          (apex/root domain)

────────────────────────────────────────────
```

### Step 3: Generate DNS Instructions

Based on the domain type, provide exact DNS records:

#### For Subdomains (app.example.com, www.example.com)

```
────────────────────────────────────────────
  DNS RECORD TO CREATE
────────────────────────────────────────────

  Type:   CNAME
  Name:   <subdomain>           (e.g., "app" or "www")
  Value:  <app>.anchorscape.com
  TTL:    Auto (or 300)

────────────────────────────────────────────
```

#### For Apex/Root Domains (example.com)

```
────────────────────────────────────────────
  DNS RECORDS TO CREATE
────────────────────────────────────────────

  Apex domains require an A record (CNAME not
  allowed at root by most providers):

  Record 1:
    Type:   A
    Name:   @                   (or leave blank)
    Value:  135.181.232.30
    TTL:    Auto (or 300)

  Record 2 (recommended):
    Type:   CNAME
    Name:   www
    Value:  <app>.anchorscape.com
    TTL:    Auto (or 300)

  Note: Some providers support CNAME flattening
  or ALIAS records at the apex. If yours does,
  use that instead of the A record.

────────────────────────────────────────────
```

### Step 4: Registrar-Specific Guides

Based on the user's DNS provider, give step-by-step instructions:

#### Cloudflare
```
  Cloudflare DNS Setup
  ────────────────────

  1. Log in to dash.cloudflare.com
  2. Select your domain
  3. Go to DNS → Records
  4. Click "Add Record"
  5. Set:
       Type:    CNAME
       Name:    <subdomain>
       Target:  <app>.anchorscape.com
       Proxy:   DNS only (gray cloud)
       TTL:     Auto
  6. Click Save

  Important: Set proxy to "DNS only" (gray
  cloud icon), not "Proxied" (orange). This
  lets Anchorscape handle SSL.

  If using apex domain (@):
    Cloudflare supports CNAME flattening.
    You CAN use a CNAME at the root:
      Type:    CNAME
      Name:    @
      Target:  <app>.anchorscape.com
```

#### GoDaddy
```
  GoDaddy DNS Setup
  ─────────────────

  1. Log in to godaddy.com → My Products
  2. Find your domain → click "DNS"
  3. Under "DNS Records", click "Add"
  4. Set:
       Type:    CNAME
       Name:    <subdomain>
       Value:   <app>.anchorscape.com
       TTL:     1 Hour
  5. Click Save

  For apex domain:
    Use an A record:
      Type:    A
      Name:    @
      Value:   135.181.232.30
      TTL:     1 Hour
```

#### Namecheap
```
  Namecheap DNS Setup
  ───────────────────

  1. Log in to namecheap.com
  2. Domain List → Manage → Advanced DNS
  3. Under "Host Records", click "Add New Record"
  4. Set:
       Type:    CNAME Record
       Host:    <subdomain>
       Value:   <app>.anchorscape.com
       TTL:     Automatic
  5. Click the checkmark to save

  For apex domain:
    Use a URL Redirect (Namecheap doesn't
    support ALIAS at apex):
      Type:    A Record
      Host:    @
      Value:   135.181.232.30
      TTL:     Automatic
```

#### AWS Route 53
```
  AWS Route 53 DNS Setup
  ──────────────────────

  1. Go to Route 53 console
  2. Hosted zones → select your domain
  3. Click "Create record"
  4. Set:
       Record name:  <subdomain>
       Record type:  CNAME
       Value:        <app>.anchorscape.com
       TTL:          300
  5. Click "Create records"

  For apex domain:
    Route 53 supports ALIAS records:
      Record name:  (leave blank)
      Record type:  A
      Alias:        No
      Value:        135.181.232.30
      TTL:          300
```

#### Google Domains / Squarespace Domains
```
  Google/Squarespace DNS Setup
  ────────────────────────────

  1. Go to domains.squarespace.com (or
     domains.google.com, now redirects)
  2. Select your domain → DNS
  3. Under "Custom records", click "Manage"
  4. Add:
       Host name:  <subdomain>
       Type:       CNAME
       Data:       <app>.anchorscape.com
       TTL:        3600
  5. Click Save

  For apex domain:
      Host name:  @
      Type:       A
      Data:       135.181.232.30
      TTL:        3600
```

#### Other Providers
```
  General DNS Setup
  ─────────────────

  Create this record in your DNS provider:

  For subdomain (<subdomain>.yourdomain.com):
    Type:    CNAME
    Name:    <subdomain>
    Value:   <app>.anchorscape.com

  For root domain (yourdomain.com):
    Type:    A
    Name:    @ (or blank)
    Value:   135.181.232.30

  If your provider supports ALIAS/ANAME records
  at the apex, use that instead of an A record.

  Common DNS providers and their docs:
    Cloudflare:    dash.cloudflare.com
    GoDaddy:       dcc.godaddy.com
    Namecheap:     ap.www.namecheap.com
    Route 53:      console.aws.amazon.com/route53
    DigitalOcean:  cloud.digitalocean.com/networking
    Vercel:        vercel.com/docs/domains
    Netlify:       app.netlify.com
```

### Step 5: Register Domain with Anchorscape

After the user has created the DNS record, tell them to register it:

```
  After adding the DNS record, register your
  domain with Anchorscape:

  Go to: https://anchorscape.com/console/deployments
    → Select your project
    → Settings → Custom Domains
    → Add: <custom-domain>

  Or wait — SSL will be provisioned automatically
  once DNS propagates (usually 5-30 minutes).
```

### Step 6: Verify DNS Propagation

Help the user check if DNS is working:

```
  Checking DNS propagation...

  You can verify DNS is set up correctly:

  1. From your terminal:
       dig <custom-domain> CNAME
       — or —
       nslookup <custom-domain>

  2. Online tools:
       https://dnschecker.org/#CNAME/<custom-domain>
       https://www.whatsmydns.net/#CNAME/<custom-domain>

  DNS changes typically take:
    Cloudflare:     Instant to 5 minutes
    GoDaddy:        15-30 minutes
    Namecheap:      10-30 minutes
    Route 53:       60 seconds
    Others:         Up to 48 hours (rare)
```

### Step 7: SSL Certificate

Once DNS is verified:

```
  SSL Certificate
  ───────────────

  Anchorscape automatically provisions a free
  SSL certificate via Let's Encrypt once DNS
  is pointing correctly.

  This usually takes 1-2 minutes after DNS
  propagation.

  Your site will be available at:
    https://<custom-domain>

  The anchorscape.com subdomain will continue
  to work as a fallback:
    https://<app>.anchorscape.com
```

### Step 8: Final Summary

```
────────────────────────────────────────────
  DNS SETUP COMPLETE
────────────────────────────────────────────

  Domain:    <custom-domain>
  Points to: <app>.anchorscape.com
  SSL:       Automatic (Let's Encrypt)
  Status:    Waiting for DNS propagation

  Once DNS propagates, your app will be at:
    https://<custom-domain>

  Check propagation:
    https://dnschecker.org/#CNAME/<custom-domain>

  Need help? Visit:
    https://anchorscape.com/guides/dns

────────────────────────────────────────────
```

## Important Notes

- **Always check deployment first**: Can't set up DNS for something that isn't deployed
- **Gray cloud on Cloudflare**: MUST be DNS-only, not proxied, for Anchorscape SSL to work
- **Apex domains are tricky**: Not all providers support CNAME at root. Fall back to A record.
- **Don't rush verification**: DNS takes time. Set expectations (5-30 min for most providers, up to 48h rare cases)
- **SSL is automatic**: Users don't need to do anything for SSL — just point DNS and wait
- **Both URLs work**: The anchorscape.com subdomain stays active even after custom domain setup
- **If the user's registrar isn't listed**: Give the general instructions and suggest they check their provider's docs
