import crypto from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, lt, sql } from "drizzle-orm";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import { refreshTokens, userIdentities, userSettings, users } from "../db/schema.js";

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
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  /**
   * Find or create a user by external identity (used by all OAuth providers).
   * 1. Lookup user_identities by (provider, providerUserId)
   * 2. If found: return associated user
   * 3. If not found: check users by email (link existing or create new)
   * 4. Insert user_identities row
   * 5. Create default userSettings on new user creation
   */
  async findOrCreateByIdentity(
    provider: string,
    providerUserId: string,
    providerEmail: string,
    metadata?: Record<string, unknown>,
    role?: string,
  ): Promise<User> {
    const resolvedRole = role ?? "Business";

    // 1. Look up existing identity
    const existingIdentity = await db
      .select()
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.provider, provider),
          eq(userIdentities.providerUserId, providerUserId),
        ),
      )
      .limit(1);

    if (existingIdentity.length > 0) {
      // 2. Identity found — update role and return associated user
      const updated = await db
        .update(users)
        .set({ role: resolvedRole, updatedAt: sql`now()` })
        .where(eq(users.id, existingIdentity[0].userId))
        .returning();

      if (updated.length === 0) throw new Error("User not found for existing identity");
      const u = updated[0];
      return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt, updatedAt: u.updatedAt };
    }

    // 3. No identity yet — find or create user by email
    const email = providerEmail.toLowerCase();
    let userId: number;
    let isNewUser = false;

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      await db.update(users).set({ role: resolvedRole, updatedAt: sql`now()` }).where(eq(users.id, userId));
    } else {
      const newUser = await db
        .insert(users)
        .values({ email, role: resolvedRole })
        .returning();
      userId = newUser[0].id;
      isNewUser = true;
    }

    // 4. Insert identity row
    await db.insert(userIdentities).values({
      userId,
      provider,
      providerUserId,
      providerEmail: email,
      metadata: metadata ?? null,
    });

    // 5. Create default settings for new users
    if (isNewUser) {
      await db.insert(userSettings).values({
        userId,
        settings: {
          telemetryConsent: "unset",
          zoomLevel: "100",
        },
      });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const u = user[0];
    return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt, updatedAt: u.updatedAt };
  }

  /**
   * Register a new user with email/password.
   */
  async register(email: string, password: string): Promise<User> {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new Error("User already exists");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash })
      .returning();

    const user = result[0];

    await db.insert(userSettings).values({
      userId: user.id,
      settings: { telemetryConsent: "unset", zoomLevel: "100" },
    });

    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }

  /**
   * Authenticate a user with email/password.
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

    if (!user.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }

  /**
   * Update user password.
   */
  async updatePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (result.length === 0) throw new Error("User not found");

    const user = result[0];

    if (!user.passwordHash) throw new Error("Current password is incorrect");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error("Current password is incorrect");

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

    await this.revokeAllRefreshTokens(userId);
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

    if (result.length === 0) return null;

    const user = result[0];
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }

  /**
   * Store a refresh token
   */
  async storeRefreshToken(userId: number, token: string): Promise<void> {
    const expiresAt = new Date(
      Date.now() + parseDurationMs(config.JWT_REFRESH_EXPIRES_IN),
    );

    await db.insert(refreshTokens).values({ userId, token, expiresAt });
  }

  /**
   * Validate and consume a refresh token
   */
  async validateRefreshToken(token: string): Promise<{ userId: number } | null> {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);

    if (result.length === 0) return null;

    const storedToken = result[0];

    if (new Date() > storedToken.expiresAt) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return null;
    }

    // One-time use
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
   * Delete user account
   */
  async deleteAccount(userId: number): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const authService = new AuthService();
