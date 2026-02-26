/**
 * Mints a Kova JWT for a user that already exists in the database.
 * The user must have logged in via Entra at least once to be provisioned.
 *
 * Usage:
 *   bun run --env-file=.env backend/scripts/get-dev-token.ts <email>
 */

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { config } from "../src/config/index.js";
import { db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { authService } from "../src/services/auth.service.js";

const email = process.argv[2];

if (!email) {
  console.error("Usage: bun run --env-file=.env backend/scripts/get-dev-token.ts <email>");
  process.exit(1);
}

const result = await db
  .select()
  .from(users)
  .where(eq(users.email, email.toLowerCase()))
  .limit(1);

if (result.length === 0) {
  console.error(`No user found for ${email}. Log in via Entra first to provision the account.`);
  process.exit(1);
}

const user = result[0];

const accessToken = await new SignJWT({ userId: user.id, email: user.email })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
  .sign(new TextEncoder().encode(config.JWT_SECRET));

const refreshToken = authService.generateRefreshToken();
await authService.storeRefreshToken(user.id, refreshToken);

console.log(JSON.stringify({ accessToken, refreshToken }, null, 2));
process.exit(0);
