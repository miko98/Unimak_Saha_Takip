# Unimak Production Deployment (Git + Render)

## 1) Git Flow

- `main`: production
- `develop`: staging/integration
- `feature/*`: new work
- PR required for merges to `main`

Release tags:

- Web/API: `vX.Y.Z`
- Desktop package: `desktop-vX.Y.Z`
- Mobile package: `mobile-vX.Y.Z`

## 2) Render Setup

This repo contains `render.yaml` with:

- `unimak-backend` (Python web service)
- `unimak-frontend` (Static site)
- `unimak-postgres` (PostgreSQL)

Render reads this file with **Blueprint** deploy.

## 3) Required Environment Variables

Backend (Render service):

- `DATABASE_URL` (from Render Postgres)
- `JWT_SECRET` (set/generate securely)
- `CORS_ALLOWED_ORIGINS` (comma-separated, ex: `https://unimak-frontend.onrender.com,http://localhost:5173`)

Frontend (Render static service):

- `VITE_API_BASE_URL` (backend public URL)

## 4) Database/Migrations

- Production uses Postgres and Alembic.
- Start command runs: `alembic upgrade head` then `uvicorn`.
- Local dev still supports sqlite fallback.

## 5) Health and Monitoring

- Health endpoint: `GET /health`
- Configure Render alerts for:
  - deploy failures
  - service down
  - high 5xx rate

## 6) Update Strategy (Web/Desktop/Mobile)

- Keep runtime policy in backend (`/client/bootstrap`) as single control point.
- Use `min_supported_version` + `latest_version` + `force_update`.
- Desktop app should consume same policy endpoint before loading shell.
- Mobile app should enforce force-update based on bootstrap response.

## 7) Desktop and Mobile Release

- Desktop (Tauri/Electron recommended):
  - Build installers from CI on `desktop-v*` tags.
  - Publish release assets and auto-update manifest.
- Mobile (Flutter):
  - Build/store release from CI on `mobile-v*` tags.
  - Keep backend policy aligned with store rollout.

## 8) Go-Live Checklist

- [ ] Render blueprint deployed successfully
- [ ] Postgres migration completed
- [ ] Frontend points to production API URL
- [ ] Login, checklist update, work-order update smoke tested
- [ ] Excel archive write test verified
- [ ] Notification flow visible in manager panel
- [ ] Backups and incident contact plan documented

## 9) Pre-Launch Verification (Recommended)

Before switching real users to production:

1. API smoke
   - `GET /health` returns `{"status":"ok"}`
   - Login endpoint works with a real production user
2. Auth + role checks
   - Saha user cannot access manager-only endpoints
   - Mudur/Yonetici can access KPI and notification endpoints
3. Data flow checks
   - New work-order + status update visible in UI
   - Checklist update writes audit + excel archive
4. Upload checks
   - Photo upload, list, and delete works end-to-end
5. Runtime policy checks
   - `/client/bootstrap` returns expected policy values
   - Force update and maintenance responses are verified

## 10) Cutover Plan (Low-Risk)

1. Deploy backend + frontend to Render (Blueprint)
2. Run smoke tests above
3. Verify logs for 5xx spikes for 15-30 minutes
4. Share production URL with pilot users first
5. Enable full rollout after pilot feedback
