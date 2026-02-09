import crypto from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, lt } from "drizzle-orm";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import { refreshTokens, userSettings, users } from "../db/schema.js";

const SALT_ROUNDS = 12;

/** Parse a duration string (e.g. "7d", "24h", "30m") to milliseconds. */
function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)\s*(d|h|m|s)$/);
  if (!match) throw new Error(`Invalid duration format: "${duration}"`);
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

export interface User {
  id: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  /**
   * Register a new user
   */
  async register(email: string, password: string): Promise<User> {
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new Error("User already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
      })
      .returning();

    const user = result[0];

    // Create default settings for user
    await db.insert(userSettings).values({
      userId: user.id,
      settings: {
        telemetryConsent: "unset",
        zoomLevel: "100",
      },
    });

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Authenticate a user and return user data (not tokens - those are handled by Fastify JWT)
   */
  async authenticate(email: string, password: string): Promise<User> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Invalid credentials");
    }

    const user = result[0];
    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      throw new Error("Invalid credentials");
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const user = result[0];
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Store a refresh token
   */
  async storeRefreshToken(userId: number, token: string): Promise<void> {
    const expiresAt = new Date(
      Date.now() + parseDurationMs(config.JWT_REFRESH_EXPIRES_IN),
    );

    await db.insert(refreshTokens).values({
      userId,
      token,
      expiresAt,
    });
  }

  /**
   * Validate and consume a refresh token
   */
  async validateRefreshToken(
    token: string,
  ): Promise<{ userId: number } | null> {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const storedToken = result[0];

    // Check if expired
    if (new Date() > storedToken.expiresAt) {
      // Delete expired token
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.id, storedToken.id));
      return null;
    }

    // Delete the used token (one-time use)
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    return { userId: storedToken.userId };
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async revokeAllRefreshTokens(userId: number): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  /**
   * Clean up expired refresh tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()))
      .returning();

    return result.length;
  }

  /**
   * Generate a secure random token
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString("hex");
  }

  /**
   * Update user password
   */
  async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0) {
      throw new Error("User not found");
    }

    const user = result[0];
    const validPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!validPassword) {
      throw new Error("Current password is incorrect");
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Revoke all refresh tokens when password changes
    await this.revokeAllRefreshTokens(userId);
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: number): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const authService = new AuthService();
