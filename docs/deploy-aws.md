# Deploy — AWS (cheapest single-instance setup)

Target: a small, low-traffic app. **One EC2 instance** runs the whole backend
stack (NestJS + MySQL + Caddy) via Docker Compose. The **frontend runs on
Vercel** (free tier). No load balancer, no RDS, no auto scaling — the cheapest
setup that is still reasonable to operate.

```
Vercel (Next.js)  ──HTTPS──▶  EC2
                                ├─ caddy   :80/:443  (auto HTTPS)
                                ├─ api     :3001     (internal only)
                                └─ mysql   :3306     (internal only, volume)
```

Estimated cost: **~$0** for the first 12 months if the instance fits the AWS
free tier, then roughly **$6–13/month** (EC2 + EBS disk). Plus a domain
(~$10/year).

---

## What's in the repo

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | Production stack: mysql + api + caddy |
| `deploy/Caddyfile` | Reverse proxy + automatic HTTPS for the API subdomain |
| `deploy/.env.prod.example` | Template for production secrets → copy to `deploy/.env.prod` |
| `deploy/backup.sh` | Nightly `mysqldump` → S3 |
| `apps/api/Dockerfile` | Builds the NestJS image (already existed) |
| `apps/api/docker-entrypoint.sh` | Runs `prisma migrate deploy` + seed on start |

---

## 1. Create the EC2 instance

1. EC2 → **Launch instance**.
2. **AMI:** Ubuntu Server 24.04 LTS.
3. **Architecture:** ARM (64-bit Arm) — pairs with the cheaper `t4g` types.
4. **Instance type:**
   - `t4g.micro` (1 GB) — cheapest; works but tight, rely on swap (step 3).
   - `t4g.small` (2 GB) — recommended, comfortable for api + mysql.
   - For the first 12 months, pick whichever type is currently **free-tier
     eligible** in your account to pay ~$0.
5. **Key pair:** create/select one so you can SSH in.
6. **Storage:** 20–30 GB gp3.
7. **Region:** `ap-southeast-1` (Singapore) for low latency from Vietnam.
8. Launch.

### Security group (firewall)

Open only what's needed:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** | admin access (avoid 0.0.0.0/0) |
| HTTP | 80 | 0.0.0.0/0 | Let's Encrypt challenge + redirect |
| HTTPS | 443 | 0.0.0.0/0 | the API |

Do **not** open 3306 (MySQL) or 3001 (API) — they stay internal to Docker.

### Elastic IP

Allocate an **Elastic IP** and associate it with the instance so the public IP
doesn't change on reboot. (Free while attached to a running instance.)

---

## 2. Point DNS at the server

At your domain registrar, create an **A record**:

```
api.your-domain.com  →  <Elastic IP>
```

Caddy will issue the TLS certificate for this exact name.

---

## 3. Server setup (SSH in)

```bash
ssh -i your-key.pem ubuntu@<Elastic IP>

# --- Docker ---
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
newgrp docker   # or log out and back in

# --- Swap (important on a 1 GB t4g.micro so the build doesn't OOM) ---
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Deploy the backend

```bash
git clone <your-repo-url> house-management
cd house-management

# Fill in real secrets
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod
#   MYSQL_ROOT_PASSWORD  -> openssl rand -base64 24
#   JWT_SECRET           -> openssl rand -hex 32
#   WEB_URL              -> your Vercel URL
#   SMTP_*               -> a real provider (SES / Resend / Mailgun / Gmail)
#   SEED_ADMIN_PASSWORD  -> a strong password

# Edit the domain + email in the Caddyfile
nano deploy/Caddyfile
#   replace api.example.com and you@example.com

# Build & start
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
```

Check it:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
curl https://api.your-domain.com/   # should respond over HTTPS
```

The entrypoint runs migrations and seeds the admin account automatically on
first boot.

---

## 5. Deploy the frontend on Vercel

1. Import the repo into Vercel.
2. **Root directory:** `apps/web`.
3. Vercel auto-detects Next.js (`apps/web/vercel.json` already sets install/build).
4. **Environment variable:**
   ```
   API_URL = https://api.your-domain.com
   ```
   (The web app calls the API server-side via this variable — see
   `apps/web/proxy.ts` / `apps/web/.env.example`.)
5. Deploy. Then set `WEB_URL` in `deploy/.env.prod` to the Vercel URL and
   restart the api container.

> CORS note: the frontend talks to the API from Vercel's servers (not the
> browser), so cross-origin browser requests aren't the primary path. If you
> later add direct browser→API calls, enable CORS in `apps/api/src/app.setup.ts`
> with `app.enableCors({ origin: WEB_URL, credentials: true })`.

---

## 6. Backups (do this — it's contract/payment data)

```bash
# One-time: install AWS CLI, create an S3 bucket, edit the script
sudo apt-get install -y awscli
nano deploy/backup.sh          # set S3_BUCKET and paths
chmod +x deploy/backup.sh

# Best practice: attach an IAM role to the EC2 instance with s3:PutObject
# on the bucket, so no AWS keys live on the server.

# Schedule nightly at 02:30
crontab -e
# add:
30 2 * * * /home/ubuntu/house-management/deploy/backup.sh >> /var/log/hm-backup.log 2>&1
```

---

## 7. Don't get a surprise bill

- **AWS Budgets:** create a monthly budget (e.g. $10) with an email alert.
- Keep the Elastic IP **attached** (an unattached EIP is billed).
- One instance, one small EBS volume, one S3 bucket — that's the whole cost.

---

## Day-2 operations

```bash
# Update to latest code
git pull
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build

# Logs / restart / stop
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml down    # stop (data survives in the volume)
```

Migrations run automatically on every deploy via the entrypoint
(`prisma migrate deploy`), so shipping a schema change is just `git pull` +
the `up -d --build` command above.

### When to graduate from this setup

Move MySQL to **RDS** (managed backups/patching) and/or put the API behind an
**Application Load Balancer** only once traffic or reliability needs justify the
extra ~$25+/month. For a small rental-management app, the single instance above
is enough for a long time.
