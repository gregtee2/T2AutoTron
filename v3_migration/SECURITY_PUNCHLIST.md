# T2AutoTron v3 Migration — Security & Hardening Punch List

Last updated: 2025-12-12

This punch list tracks remaining security/reliability hardening work after implementing PIN auth + secret masking + safer Electron defaults.

## ✅ Recently Completed

- Added "local or PIN" protection for sensitive REST endpoints.
- Added client-side PIN UX with "Remember PIN" and auto-auth for Socket.IO.
- Added server-side `APP_PIN` management via Settings UI (no manual `.env` edits required).
- Masked secrets in `/api/settings` responses and prevented accidental overwrites of masked secrets.
- Tightened Electron defaults (production `webSecurity: true`, allowlisted IPC channels).
- Tightened CSP (no `unsafe-eval` in production).

See details in `.github/copilot-instructions.md`.

## 🔴 P0 (High Risk / High Impact)

1) Harden update apply endpoint beyond PIN
- Risk: update apply is effectively remote code execution (git pull + install).
- Current: Protected via `requireLocalOrPin` at router-level.
- Recommended next:
  - Add rate limiting for `/api/update/*`.
  - Add explicit confirmation token (one-time nonce) per UI session.
  - Add audit log entries (who/when/ip, result).
  - Add a production toggle to disable apply entirely (e.g. `UPDATES_ENABLED=false`).
- Files:
  - `v3_migration/backend/src/api/updateRoutes.js`
  - `v3_migration/backend/src/services/updateService.js`
  - `v3_migration/backend/src/api/middleware/requireLocalOrPin.js`

2) Standardize auth coverage for state-changing operations
- Ensure all state-changing REST endpoints (POST/PUT/DELETE) are protected consistently.
- Current: `POST /api/settings*`, `/api/update/*`, and `POST /api/devices` are protected.
- Suggested: review other routes for control actions.
- Files:
  - `v3_migration/backend/src/api/routes/*`
  - `v3_migration/backend/src/api/socketHandlers.js` (socket controls already require auth)

## 🟠 P1 (Important)

3) Add lockout/backoff for invalid PIN attempts
- Prevent brute-force attempts on LAN.
- Add per-IP or per-socket backoff after N failures.
- Files:
  - `v3_migration/backend/src/api/middleware/requireLocalOrPin.js`
  - `v3_migration/backend/src/api/middleware/authMiddleware.js`
  - `v3_migration/backend/src/api/socketHandlers.js`

4) Improve UX for PIN state + troubleshooting
- Add clearer UI state in Dock (e.g., "Authenticated" vs "Local-only") and a link to Settings → Security.
- Current: toast on auth success/failure.
- Files:
  - `v3_migration/frontend/src/App.jsx`
  - `v3_migration/frontend/src/ui/SettingsModal.jsx`

5) Make server bind mode explicit
- Decide whether backend should bind to `127.0.0.1` by default vs `0.0.0.0`.
- Consider a settings toggle + docs.
- Files:
  - `v3_migration/backend/src/server.js`

## 🟡 P2 (Nice-to-have)

6) Plugin trust boundary clarity
- Runtime plugins are trusted code by design; document that clearly and optionally add an allowlist/signed mode.
- Files:
  - `v3_migration/PLUGIN_ARCHITECTURE.md`
  - `v3_migration/backend/src/devices/pluginLoader.js`

7) Optional: split secret storage from `.env`
- For more "pro" deployments, consider OS credential store / encrypted secrets file.

8) Security docs for end users
- A short "Security" section in `GETTING_STARTED.md`:
  - Set PIN
  - LAN vs remote access
  - Firewall recommendations

## Quick Verification Checklist

- Settings → Security → Save PIN writes `APP_PIN` into `v3_migration/backend/.env`.
- Opening UI via LAN IP (not localhost) requires PIN for protected actions (updates, settings test).
- Socket auto-auth shows "Authenticated" toast when PIN is valid.
