import type { TestContext } from "../run.js";
import {
  createApp,
  deleteApp,
  getApp,
  getAppStatus,
  getChat,
  getMe,
  listApps,
  login,
} from "../lib/api.js";
import { assert, assertEq, log } from "../lib/log.js";

/**
 * Smoke test — validates the sandbox harness and core API integrations
 * without triggering agent/container orchestration.
 *
 * Exercises: auth, app CRUD, chat retrieval, app status, k8s namespace.
 */
export default async function smokeTest(ctx: TestContext): Promise<void> {
  // ── Auth ──────────────────────────────────────────────────────────────────

  // Verify the token from the runner works with /api/auth/me
  const me = await getMe(ctx.token);
  assertEq(me.email, "dev@kova.local", "auth/me email");
  assert(typeof me.id === "number", "auth/me id should be a number");
  log("pass", `GET /api/auth/me → ${me.email} (id=${me.id})`);

  // Verify login with wrong password fails
  let badLoginFailed = false;
  try {
    await login("dev@kova.local", "wrongpassword");
  } catch {
    badLoginFailed = true;
  }
  assert(badLoginFailed, "Login with wrong password should fail");
  log("pass", "Login with wrong credentials correctly rejected");

  // ── App creation ──────────────────────────────────────────────────────────

  const appName = `smoke-test-${Date.now()}`;
  const { app, chatId } = await createApp(ctx.token, appName);
  assert(typeof app.id === "number", "app.id should be a number");
  assertEq(app.name, appName, "app name");
  assert(typeof chatId === "number", "chatId should be a number");
  log("pass", `POST /api/apps → app ${app.id}, chat ${chatId}`);

  // ── App retrieval ─────────────────────────────────────────────────────────

  const fetched = await getApp(ctx.token, app.id);
  assertEq(fetched.id, app.id, "getApp id");
  assertEq(fetched.name, appName, "getApp name");
  log("pass", `GET /api/apps/${app.id} → ${fetched.name}`);

  // ── App listing ───────────────────────────────────────────────────────────

  const apps = await listApps(ctx.token);
  assert(Array.isArray(apps), "listApps should return an array");
  const found = apps.find((a) => a.id === app.id);
  assert(found, `App ${app.id} should appear in listApps`);
  log("pass", `GET /api/apps → ${apps.length} app(s), includes ${app.id}`);

  // ── App status (should be stopped — no container started) ─────────────────

  const status = await getAppStatus(ctx.token, app.id);
  assertEq(status.status, "stopped", "New app status should be stopped");
  log("pass", `GET /api/apps/${app.id}/status → stopped`);

  // ── Chat retrieval ────────────────────────────────────────────────────────

  const chat = await getChat(ctx.token, chatId);
  assertEq(chat.id, chatId, "chat id");
  assertEq(chat.appId, app.id, "chat.appId should match app");
  assert(Array.isArray(chat.messages), "chat.messages should be an array");
  assertEq(chat.messages.length, 0, "New chat should have 0 messages");
  log("pass", `GET /api/chats/${chatId} → empty chat for app ${app.id}`);

  // ── Cleanup: delete the app ───────────────────────────────────────────────

  const del = await deleteApp(ctx.token, app.id);
  assert(del.success, "deleteApp should return success");
  log("pass", `DELETE /api/apps/${app.id} → cleaned up`);

  // Verify it's gone from listing
  const appsAfter = await listApps(ctx.token);
  const gone = appsAfter.find((a) => a.id === app.id);
  assert(!gone, "Deleted app should not appear in listApps");
  log("pass", "Deleted app no longer in listing");
}
