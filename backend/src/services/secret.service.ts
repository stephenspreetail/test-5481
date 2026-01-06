import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import { appEnvVars, userSecrets } from "../db/schema.js";

interface EncryptedData {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

class SecretService {
  private masterKey: Buffer;

  constructor() {
    this.masterKey = Buffer.from(config.ENCRYPTION_KEY, "hex");
  }

  /**
   * Encrypt a plaintext value using AES-256-GCM
   */
  encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    return {
      encryptedValue: encrypted,
      iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
    };
  }

  /**
   * Decrypt an encrypted value
   */
  decrypt(data: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      Buffer.from(data.iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(data.authTag, "hex"));

    let decrypted = decipher.update(data.encryptedValue, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // =====================
  // User Secrets
  // =====================

  /**
   * Store a secret for a user
   */
  async setUserSecret(
    userId: number,
    key: string,
    value: string,
  ): Promise<void> {
    const encrypted = this.encrypt(value);

    await db
      .insert(userSecrets)
      .values({
        userId,
        key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      .onConflictDoUpdate({
        target: [userSecrets.userId, userSecrets.key],
        set: {
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get a decrypted secret for a user
   */
  async getUserSecret(userId: number, key: string): Promise<string | null> {
    const result = await db
      .select()
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, key)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const secret = result[0];
    return this.decrypt({
      encryptedValue: secret.encryptedValue,
      iv: secret.iv,
      authTag: secret.authTag,
    });
  }

  /**
   * Delete a secret for a user
   */
  async deleteUserSecret(userId: number, key: string): Promise<void> {
    await db
      .delete(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.key, key)));
  }

  /**
   * Get all secret keys for a user (not the values)
   */
  async listUserSecretKeys(userId: number): Promise<string[]> {
    const result = await db
      .select({ key: userSecrets.key })
      .from(userSecrets)
      .where(eq(userSecrets.userId, userId));

    return result.map((r) => r.key);
  }

  // =====================
  // App Environment Variables
  // =====================

  /**
   * Set an environment variable for an app
   */
  async setAppEnvVar(appId: number, key: string, value: string): Promise<void> {
    const encrypted = this.encrypt(value);

    await db
      .insert(appEnvVars)
      .values({
        appId,
        key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      .onConflictDoUpdate({
        target: [appEnvVars.appId, appEnvVars.key],
        set: {
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get a decrypted environment variable for an app
   */
  async getAppEnvVar(appId: number, key: string): Promise<string | null> {
    const result = await db
      .select()
      .from(appEnvVars)
      .where(and(eq(appEnvVars.appId, appId), eq(appEnvVars.key, key)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const envVar = result[0];
    return this.decrypt({
      encryptedValue: envVar.encryptedValue,
      iv: envVar.iv,
      authTag: envVar.authTag,
    });
  }

  /**
   * Get all decrypted environment variables for an app
   */
  async getAllAppEnvVars(appId: number): Promise<Record<string, string>> {
    const result = await db
      .select()
      .from(appEnvVars)
      .where(eq(appEnvVars.appId, appId));

    const envVars: Record<string, string> = {};
    for (const envVar of result) {
      envVars[envVar.key] = this.decrypt({
        encryptedValue: envVar.encryptedValue,
        iv: envVar.iv,
        authTag: envVar.authTag,
      });
    }

    return envVars;
  }

  /**
   * Delete an environment variable for an app
   */
  async deleteAppEnvVar(appId: number, key: string): Promise<void> {
    await db
      .delete(appEnvVars)
      .where(and(eq(appEnvVars.appId, appId), eq(appEnvVars.key, key)));
  }

  /**
   * List all environment variable keys for an app (not values)
   */
  async listAppEnvVarKeys(appId: number): Promise<string[]> {
    const result = await db
      .select({ key: appEnvVars.key })
      .from(appEnvVars)
      .where(eq(appEnvVars.appId, appId));

    return result.map((r) => r.key);
  }
}

export const secretService = new SecretService();
