# Production Deployment & Database Persistence Guide

This guide details the procedure for deploying the Online Assessment Platform on a Linux/Cloud server (e.g. AWS EC2, DigitalOcean, Hetzner, GCP), protecting internal service ports, and ensuring database records are **never** erased during code updates or container rebuilds.

---

## 🛡️ Port Protection & Security Architecture

### Public vs. Internal Services

| Service | Container Port | Host Binding | Public Internet Access | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend (Nginx)** | `80` | `${FRONTEND_PORT:-80}:80` | **Public Allowed** | Serves single-page web app & reverse-proxies `/api` |
| **Backend (FastAPI)** | `8000` | `127.0.0.1:${BACKEND_PORT:-8000}:8000` | **Restricted to Localhost** | Proxied internally by Nginx |
| **PostgreSQL Database** | `5432` | `127.0.0.1:${POSTGRES_PORT:-5432}:5432` | **Restricted to Localhost** | Blocked from external internet scanners |
| **Redis Cache** | `6379` | `127.0.0.1:${REDIS_PORT:-6379}:6379` | **Restricted to Localhost** | Internal container communication only |
| **Ollama AI** | `11434` | `127.0.0.1:${OLLAMA_PORT:-11434}:11434` | **Restricted to Localhost** | Internal backend communication only |

> [!IMPORTANT]
> Because internal services are bound to `127.0.0.1` (or isolated within Docker's private bridge network), external attackers cannot access PostgreSQL (5432) or Redis (6379) over the server's public IP address.

---

## 💾 Database Persistence Guarantee

PostgreSQL data is permanently stored in the named Docker volume **`pgdata`** mapped to `/var/lib/postgresql/data`.

### ✅ Safe Commands (Preserves All Data)

To deploy new code changes, update backend/frontend containers, or pull updates:

```bash
# 1. Pull latest code changes
git pull origin main

# 2. Rebuild and restart containers (DATABASE IS PRESERVED 100%)
docker compose up -d --build
```

> [!NOTE]
> Running `docker compose up -d --build` restarts the containers and applies Alembic migrations automatically without touching the underlying `pgdata` volume. All registered organizations, students, test records, and question banks will remain completely intact.

### ⚠️ Dangerous Commands (DO NOT RUN IN PRODUCTION)

- ❌ `docker compose down -v` — The `-v` flag **DELETES ALL DOCKER VOLUMES**, erasing the database!
- ❌ `docker volume rm online_assessment_pgdata` — Explicitly deletes the PostgreSQL volume!

---

## 🗄️ Database Backup & Restore Procedures

### 1. Create a Database Backup (`pg_dump`)

Run this command anytime to create a timestamped SQL backup file:

```bash
docker exec online_assessment-postgres-1 pg_dump -U postgres assessment_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Restore Database from Backup (`psql`)

To restore database from a `.sql` backup file:

```bash
docker exec -i online_assessment-postgres-1 psql -U postgres assessment_db < backup_filename.sql
```

---

## 🚀 First-Time Production Setup Checklist

1. Clone repository to your production server:
   ```bash
   git clone <your-repo-url>
   cd online_assessment
   ```
2. Configure production secrets in `backend/.env.docker`:
   - Change `JWT_SECRET` to a strong random string.
   - Set `POSTGRES_PASSWORD` to a secure password.
   - Set `SMTP_USER` and `SMTP_PASSWORD` for live verification emails.
3. Start the application:
   ```bash
   docker compose up -d --build
   ```
4. Check health status:
   ```bash
   docker compose ps
   ```
