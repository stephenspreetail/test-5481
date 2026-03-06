import crypto from "crypto";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { config } from "../../config/index.js";
import { authService } from "../../services/auth.service.js";
import { entraAuthService } from "../../services/entra-auth.service.js";
import { JWTPayload, authMiddleware } from "../middleware/auth.middleware.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const entraEnabled =
  !!config.ENTRA_TENANT_ID &&
  !!config.ENTRA_CLIENT_ID &&
  !!config.ENTRA_CLIENT_SECRET &&
  !!config.ENTRA_REDIRECT_URI;

const jwtSecretBytes = new TextEncoder().encode(config.JWT_SECRET);

/** Pick the highest-priority Kova role from the Entra roles claim. */
function resolveRole(roles?: string[]): string {
  if (roles?.includes("Admin")) return "Admin";
  if (roles?.includes("Developer")) return "Developer";
  return "Business";
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * GET /api/auth/config
   * Returns which auth providers are enabled.
   */
  app.get("/config", async (_request: FastifyRequest, _reply: FastifyReply) => {
    return { entraEnabled };
  });

  /**
   * POST /api/auth/register
   * Register a new user with email/password.
   */
  app.post("/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    try {
      const user = await authService.register(body.email, body.password);

      const accessToken = app.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
      } as JWTPayload);

      const refreshToken = authService.generateRefreshToken();
      await authService.storeRefreshToken(user.id, refreshToken);

      return { user: { id: user.id, email: user.email }, accessToken, refreshToken };
    } catch (error: any) {
      if (error.message === "User already exists") {
        reply.status(409).send({ error: "User already exists" });
        return;
      }
      throw error;
    }
  });

  /**
   * POST /api/auth/login
   * Login with email/password.
   */
  app.post("/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    try {
      const user = await authService.authenticate(body.email, body.password);

      const accessToken = app.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
      } as JWTPayload);

      const refreshToken = authService.generateRefreshToken();
      await authService.storeRefreshToken(user.id, refreshToken);

      return { user: { id: user.id, email: user.email }, accessToken, refreshToken };
    } catch (error: any) {
      if (error.message === "Invalid credentials") {
        reply.status(401).send({ error: "Invalid credentials" });
        return;
      }
      throw error;
    }
  });

  if (entraEnabled) {
    /**
     * GET /api/auth/entra/login
     * Initiates Entra ID OAuth flow.
     * Pass ?silent=true to use prompt=none for silent re-authentication
     * (re-uses existing Entra session without showing a login page).
     */
    app.get(
      "/entra/login",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { silent } = request.query as Record<string, string>;
        const isSilent = silent === "true";

        const nonce = crypto.randomBytes(16).toString("hex");
        const stateJwt = await new SignJWT({ nonce, silent: isSilent })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("5m")
          .sign(jwtSecretBytes);

        const authUrl = entraAuthService.getAuthorizationUrl(
          stateJwt,
          isSilent ? { prompt: "none" } : undefined,
        );
        reply.redirect(authUrl);
      },
    );

    /**
     * GET /api/auth/entra/callback
     * Handles Entra ID OAuth callback.
     */
    app.get(
      "/entra/callback",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { code, state, error } = request.query as Record<string, string>;

        if (error) {
          // For silent auth (prompt=none), fall back to interactive login rather than
          // returning an error. This handles interaction_required / login_required.
          try {
            const { payload } = await jwtVerify(state || "", jwtSecretBytes);
            if (payload.silent) {
              const frontendUrl = config.CORS_ORIGIN || "http://localhost:5174";
              reply.redirect(`${frontendUrl}/login`);
              return;
            }
          } catch {
            // State JWT invalid or missing — fall through to error response
          }
          reply.status(400).send({ error: `Entra auth error: ${error}` });
          return;
        }

        if (!code || !state) {
          reply.status(400).send({ error: "Missing code or state" });
          return;
        }

        // Verify state JWT (CSRF protection)
        try {
          await jwtVerify(state, jwtSecretBytes);
        } catch {
          reply.status(400).send({ error: "Invalid or expired state token" });
          return;
        }

        try {
          const { idToken } = await entraAuthService.exchangeCodeForTokens(code);
          const claims = await entraAuthService.validateIdToken(idToken);

          const role = resolveRole(claims.roles);
          const user = await authService.findOrCreateByIdentity(
            "entra",
            claims.oid,
            claims.email,
            { preferred_username: claims.preferred_username },
            role,
          );

          const accessToken = app.jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.role,
          } as JWTPayload);

          const refreshToken = authService.generateRefreshToken();
          await authService.storeRefreshToken(user.id, refreshToken);

          const frontendUrl = config.CORS_ORIGIN || "http://localhost:5174";
          reply.redirect(
            `${frontendUrl}/?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`,
          );
        } catch (err: any) {
          app.log.error(err, "Entra callback error");
          reply.status(500).send({ error: "Authentication failed" });
        }
      },
    );
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  app.post("/refresh", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(request.body);

    const result = await authService.validateRefreshToken(body.refreshToken);

    if (!result) {
      reply.status(401).send({ error: "Invalid or expired refresh token" });
      return;
    }

    const user = await authService.getUserById(result.userId);

    if (!user) {
      reply.status(401).send({ error: "User not found" });
      return;
    }

    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    } as JWTPayload);

    const refreshToken = authService.generateRefreshToken();
    await authService.storeRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
  });

  /**
   * POST /api/auth/logout
   * Logout and revoke all refresh tokens
   */
  app.post(
    "/logout",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      await authService.revokeAllRefreshTokens(user.userId);
      return { success: true };
    },
  );

  /**
   * GET /api/auth/me
   * Get current user info
   */
  app.get(
    "/me",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userData = await authService.getUserById(user.userId);

      if (!userData) {
        reply.status(404).send({ error: "User not found" });
        return;
      }

      return {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        createdAt: userData.createdAt,
      };
    },
  );

  /**
   * POST /api/auth/change-password
   * Change user password.
   */
  app.post(
    "/change-password",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = changePasswordSchema.parse(request.body);

      try {
        await authService.updatePassword(user.userId, body.currentPassword, body.newPassword);
        return { success: true };
      } catch (error: any) {
        if (error.message === "Current password is incorrect") {
          reply.status(400).send({ error: error.message });
          return;
        }
        throw error;
      }
    },
  );

  /**
   * DELETE /api/auth/account
   * Delete user account
   */
  app.delete(
    "/account",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      await authService.deleteAccount(user.userId);
      return { success: true };
    },
  );
}
