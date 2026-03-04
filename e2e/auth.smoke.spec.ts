import { expect, test } from "@playwright/test";

const TENANT_ID = "9b5b8dd2-61cb-4b6f-9664-28fd7b133562";
const MS_AUTH_ORIGIN = "https://login.microsoftonline.com";

test.describe("Entra SSO smoke tests", () => {
  test("login page renders with email/password form and Microsoft button", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Kova" })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in with microsoft/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("login page toggles to register form", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("GET /api/auth/config reports entraEnabled: true", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/config");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.entraEnabled).toBe(true);
  });

  test("/api/auth/entra/login redirects to Microsoft with correct params", async ({
    page,
  }) => {
    let microsoftUrl: URL | null = null;

    // Intercept the outbound redirect to Microsoft before it fires
    page.on("request", (req) => {
      if (req.url().startsWith(MS_AUTH_ORIGIN)) {
        microsoftUrl = new URL(req.url());
      }
    });

    // Block the actual navigation to Microsoft (avoids hanging on external page)
    await page.route(`${MS_AUTH_ORIGIN}/**`, (route) => route.abort());

    await page.goto("/api/auth/entra/login", {
      waitUntil: "commit",
    }).catch(() => {
      // Expected: navigation aborted when we hit the Microsoft URL
    });

    expect(microsoftUrl, "should have redirected to Microsoft login").not.toBeNull();

    const params = microsoftUrl!.searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBeTruthy();
    expect(params.get("scope")).toContain("openid");
    expect(params.get("redirect_uri")).toContain("/api/auth/entra/callback");
    expect(params.get("state")).toBeTruthy();

    // Verify tenant in the URL path
    expect(microsoftUrl!.pathname).toContain(TENANT_ID);
  });

  test("unauthenticated request to /api/apps returns 401", async ({
    request,
  }) => {
    const res = await request.get("/api/apps");
    expect(res.status()).toBe(401);
  });

  test("email/password login with dev@kova.local lands on home page", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("dev@kova.local");
    await page.getByLabel("Password").fill("dev");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Should redirect to home after successful login
    await expect(page).toHaveURL(/^http:\/\/localhost:5174\/?(\?.*)?$/, { timeout: 5000 });
    // Verify we're actually authenticated — home content should be visible, not login
    await expect(page.getByRole("button", { name: /sign in/i })).not.toBeVisible();
  });
});
