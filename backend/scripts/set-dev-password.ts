/**
 * Sets a password for a local dev account.
 * Usage: bun run --env-file=.env backend/scripts/set-dev-password.ts <email> <password>
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: bun run --env-file=.env backend/scripts/set-dev-password.ts <email> <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const result = await db.update(users).set({ passwordHash: hash }).where(eq(users.email, email.toLowerCase())).returning();

if (result.length === 0) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

console.log(`Password set for ${email}`);
process.exit(0);
