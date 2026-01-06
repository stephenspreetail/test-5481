import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authService } from "../../services/auth.service.js";
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

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/register
   * Register a new user
   */
  app.post(
    "/register",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerSchema.parse(request.body);

      try {
        const user = await authService.register(body.email, body.password);

        // Generate tokens
        const accessToken = app.jwt.sign({
          userId: user.id,
          email: user.email,
        } as JWTPayload);

        const refreshToken = authService.generateRefreshToken();
        await authService.storeRefreshToken(user.id, refreshToken);

        return {
          user: {
            id: user.id,
            email: user.email,
          },
          accessToken,
          refreshToken,
        };
      } catch (error: any) {
        if (error.message === "User already exists") {
          reply.status(409).send({ error: "User already exists" });
          return;
        }
        throw error;
      }
    },
  );

  /**
   * POST /api/auth/login
   * Login and get tokens
   */
  app.post("/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    try {
      const user = await authService.authenticate(body.email, body.password);

      // Generate tokens
      const accessToken = app.jwt.sign({
        userId: user.id,
        email: user.email,
      } as JWTPayload);

      const refreshToken = authService.generateRefreshToken();
      await authService.storeRefreshToken(user.id, refreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
        },
        accessToken,
        refreshToken,
      };
    } catch (error: any) {
      if (error.message === "Invalid credentials") {
        reply.status(401).send({ error: "Invalid credentials" });
        return;
      }
      throw error;
    }
  });

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

    // Generate new tokens
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
    } as JWTPayload);

    const refreshToken = authService.generateRefreshToken();
    await authService.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
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
        createdAt: userData.createdAt,
      };
    },
  );

  /**
   * POST /api/auth/change-password
   * Change user password
   */
  app.post(
    "/change-password",
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = changePasswordSchema.parse(request.body);

      try {
        await authService.updatePassword(
          user.userId,
          body.currentPassword,
          body.newPassword,
        );
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
