# Auth Improvements (Deferred)

Issues identified during auth flow validation. Not urgent for local development but should be addressed before any public/production deployment.

## 1. TOCTOU race condition in refresh token validation

**Severity:** Moderate
**File:** `backend/src/services/auth.service.ts` — `validateRefreshToken()` (lines 157-181)

The method performs a SELECT then a separate DELETE. Two concurrent requests with the same refresh token could both succeed before either deletes it.

**Fix:** Replace the SELECT + DELETE with a single atomic `DELETE ... RETURNING` query, or wrap in a transaction with `SELECT ... FOR UPDATE`.

## 2. No rate limiting on auth endpoints

**Severity:** Moderate (critical for production)
**File:** `backend/src/api/routes/auth.routes.ts`

`/api/auth/login`, `/api/auth/register`, and `/api/auth/refresh` have no rate limiting. The login endpoint can be brute-forced with unlimited password guesses.

**Fix:** Add `@fastify/rate-limit` plugin. Suggested limits:
- `/api/auth/login`: 5 attempts per minute per IP
- `/api/auth/register`: 3 attempts per minute per IP
- `/api/auth/refresh`: 10 attempts per minute per IP

## 3. Refresh tokens stored as plaintext in DB

**Severity:** Advisory
**File:** `backend/src/db/schema.ts` (line 31), `backend/src/services/auth.service.ts`

Refresh tokens are stored as raw hex strings. A database breach would directly expose valid tokens.

**Fix:** Hash tokens with SHA-256 before storing. On validation, hash the incoming token and compare against the stored hash. Update `storeRefreshToken()` and `validateRefreshToken()` accordingly.

## 4. No session expiry notification in UI

**Severity:** Low
**File:** `src/renderer.tsx` — `onUnauthorized` handler (lines 26-32)

When a session expires, the user is silently redirected to the login page with no message. This can be confusing if they were in the middle of work.

**Fix:** Show a toast notification (e.g., "Session expired, please log in again") before redirecting.
