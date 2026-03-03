#!/usr/bin/env bun
/**
 * IAM-authenticated database migration script.
 *
 * Generates an RDS IAM auth token, builds a DATABASE_URL, then execs
 * `drizzle-kit migrate` to apply committed SQL migration files against the
 * RDS instance. Designed to run as a Helm pre-upgrade hook inside EKS
 * where Pod Identity provides AWS credentials.
 *
 * NOTE: We use `drizzle-kit migrate` (file-based) instead of `drizzle-kit push`
 * (schema-diff) because `push --force` silently skips DDL in non-interactive
 * environments (no TTY). `migrate` runs committed SQL files deterministically.
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

// Baseline: if this is an existing DB that was managed by `drizzle-kit push`,
// the drizzle.__drizzle_migrations tracking table won't exist (or will be empty).
// We need to seed the initial 0000 migration as already applied so `migrate`
// doesn't try to CREATE TABLE on tables that already exist.
console.log("Checking migration baseline...");
const { Client: PgClient } = await import("pg");
const baselineClient = new PgClient({ connectionString: databaseUrl });
await baselineClient.connect();

const { rows: trackingTable } = await baselineClient.query(
  `SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`,
);

if (trackingTable.length > 0) {
  // Tracking table exists — check if baseline is seeded
  const { rows: migrations } = await baselineClient.query(
    `SELECT hash FROM drizzle."__drizzle_migrations" ORDER BY id`,
  );
  if (migrations.length > 0) {
    console.log(`Migration tracking table has ${migrations.length} record(s) — continuing normally`);
  } else {
    // Table exists but empty (e.g. created by a failed migrate run).
    // Check if DB has existing tables that need the baseline seed.
    const { rows: existingTables } = await baselineClient.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'apps'`,
    );
    if (existingTables.length > 0) {
      console.log("Existing DB with empty tracking table — seeding baseline...");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const journalPath = path.join(import.meta.dir, "..", "drizzle", "meta", "_journal.json");
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
      const baseline = journal.entries[0];
      if (baseline) {
        await baselineClient.query(
          `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
          [baseline.tag, baseline.when],
        );
        console.log(`Seeded baseline: ${baseline.tag}`);
      }
    } else {
      console.log("Fresh DB — migrate will apply all migrations from scratch");
    }
  }
} else {
  // No tracking table at all — check if this is a fresh DB or an existing one
  const { rows: existingTables } = await baselineClient.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'apps'`,
  );
  if (existingTables.length > 0) {
    console.log("Existing DB with no tracking table — creating schema and seeding baseline...");
    await baselineClient.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await baselineClient.query(`
      CREATE TABLE drizzle."__drizzle_migrations" (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    const fs = await import("node:fs");
    const path = await import("node:path");
    const journalPath = path.join(import.meta.dir, "..", "drizzle", "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const baseline = journal.entries[0];
    if (baseline) {
      await baselineClient.query(
        `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [baseline.tag, baseline.when],
      );
      console.log(`Seeded baseline: ${baseline.tag}`);
    }
  } else {
    console.log("Fresh DB — migrate will create everything from scratch");
  }
}
await baselineClient.end();

console.log("Running drizzle-kit migrate...");

const proc = Bun.spawn(["bun", "run", "drizzle-kit", "migrate"], {
  cwd: `${import.meta.dir}/..`,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(`drizzle-kit migrate failed with exit code ${exitCode}`);
  process.exit(exitCode);
}

console.log("Migration completed successfully");

// Grant privileges on all tables to the app service user (kova_svc).
// Migrations run as kova_admin, so newly created tables are not
// automatically accessible to kova_svc. This runs after every migration
// to ensure any new tables are covered.
const APP_USER = "kova_svc";
console.log(`Granting privileges to ${APP_USER}...`);
const { Client } = await import("pg");
const client = new Client({ connectionString: databaseUrl });
await client.connect();
await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER}`);
await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER}`);
await client.end();
console.log(`Grants applied successfully`);
