### Backend: `backend/.env` vs `backend/.env.example`

| Key                             | Status                               | Example value (from `backend/.env.example`)   | Actual value (from `backend/.env`) |
| ------------------------------- | ------------------------------------ | --------------------------------------------- | ---------------------------------- |
| `HOST`                          | Missing in `.env`                    | `0.0.0.0`                                     | —                                  |
| `DOCKER_SOCKET`                 | Missing in `.env`                    | `/var/run/docker.sock`                        | —                                  |
| `AGENT_MODEL`                   | Missing in `.env`                    | `claude-sonnet-4-20250514`                    | —                                  |
| `CONTAINER_NETWORK`             | Missing in `.env`                    | `kova-network`                                | —                                  |
| `PREVIEW_DOMAIN`                | Missing in `.env`                    | `localhost`                                   | —                                  |
| `PREVIEW_PORT`                  | Missing in `.env`                    | `8081`                                        | —                                  |
| `AGENT_PORT`                    | Missing in `.env`                    | `3100`                                        | —                                  |
| `DEV_SERVER_PORT`               | Missing in `.env`                    | `3000`                                        | —                                  |
| `JWT_REFRESH_SECRET`            | Extra in `.env`                      | —                                             | `(set)`                            |
| `TRAEFIK_HEARTBEAT_INTERVAL_MS` | Extra in `.env`                      | —                                             | `16000`                            |
| `CONTAINER_SCAN_INTERVAL_MS`    | Extra in `.env`                      | —                                             | `16000`                            |
| `JWT_ACCESS_EXPIRES_IN`         | Different value                      | `15m`                                         | `180m`                             |
| `APPS_BASE_PATH`                | Different value                      | `/data/kova-apps`                             | `./apps`                           |
| `JWT_SECRET`                    | Different value (placeholder vs set) | `your-jwt-secret-at-least-32-characters-long` | `(set)`                            |
| `ENCRYPTION_KEY`                | Different value (placeholder vs set) | `your-64-character-hex-encryption-key-here`   | `(set)`                            |
| `ANTHROPIC_API_KEY`             | Different value (placeholder vs set) | `sk-ant-your-api-key-here`                    | `(set)`                            |

---

### Root: `.env` vs `.env.example`

| Key                         | Status            | Example value (from `.env.example`) | Actual value (from `.env`) |
| --------------------------- | ----------------- | ----------------------------------- | -------------------------- |
| `GITHUB_CLIENT_ID`          | Missing in `.env` | _(empty)_                           | —                          |
| `GITHUB_CLIENT_SECRET`      | Missing in `.env` | _(empty)_                           | —                          |
| `GITHUB_TOKEN`              | Missing in `.env` | _(empty)_                           | —                          |
| `APPLE_ID`                  | Missing in `.env` | _(empty)_                           | —                          |
| `APPLE_PASSWORD`            | Missing in `.env` | _(empty)_                           | —                          |
| `APPLE_TEAM_ID`             | Missing in `.env` | _(empty)_                           | —                          |
| `SM_CODE_SIGNING_CERT_SHA1` | Missing in `.env` | _(empty)_                           | —                          |
| `GITLAB_CLIENT_ID`          | Extra in `.env`   | —                                   | _(empty)_                  |
| `GITLAB_CLIENT_SECRET`      | Extra in `.env`   | —                                   | _(empty)_                  |
| `GITLAB_TOKEN`              | Extra in `.env`   | —                                   | _(empty)_                  |
