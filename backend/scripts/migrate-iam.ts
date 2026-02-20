#!/usr/bin/env bun
/**
 * IAM-authenticated database migration script.
 *
 * Generates an RDS IAM auth token, builds a DATABASE_URL, then execs
 * `bunx drizzle-kit push` so Drizzle can apply schema changes against the
 * RDS instance. Designed to run as a Helm pre-upgrade hook inside EKS
 * where Pod Identity provides AWS credentials.
 *
 * Required env vars: DB_HOST, DB_NAME, DB_USER
 * Optional env vars: DB_PORT (5432), DB_REGION (us-east-1),
 *                    DB_SSL_CA_PATH (/etc/ssl/rds-global-bundle.pem)
 */

import { Signer } from "@aws-sdk/rds-signer";

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT ?? "5432");
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_REGION = process.env.DB_REGION ?? "us-east-1";
const DB_SSL_CA_PATH =
  process.env.DB_SSL_CA_PATH ?? "/etc/ssl/rds-global-bundle.pem";

if (!DB_HOST || !DB_NAME || !DB_USER) {
  console.error("Missing required env vars: DB_HOST, DB_NAME, DB_USER");
  process.exit(1);
}

console.log(`Generating IAM auth token for ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

const signer = new Signer({
  hostname: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  region: DB_REGION,
});

const token = await signer.getAuthToken();
console.log(`Token generated (${token.length} chars)`);

const encodedToken = encodeURIComponent(token);
const sslParams = `sslmode=require&sslrootcert=${encodeURIComponent(DB_SSL_CA_PATH)}`;
const databaseUrl = `postgresql://${DB_USER}:${encodedToken}@${DB_HOST}:${DB_PORT}/${DB_NAME}?${sslParams}`;

console.log("Running drizzle-kit push...");

const proc = Bun.spawn(["bun", "run", "drizzle-kit", "push"], {
  cwd: `${import.meta.dir}/..`,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(`drizzle-kit push failed with exit code ${exitCode}`);
  process.exit(exitCode);
}

console.log("Migration completed successfully");
