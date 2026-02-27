#!/usr/bin/env bun
/**
 * Migration: Add guid and slug columns to apps table
 *
 * Safe, backwards-compatible, non-interactive, idempotent.
 *
 * Usage: bun run --cwd backend scripts/migrate-add-app-guid-slug.ts
 */

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://kova:kova_dev_password@localhost:5433/kova";

const client = new pg.Client({ connectionString: DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log("[migrate] Connected to database");

  // Check if guid column already exists
  const { rows: guidCheck } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'apps' AND column_name = 'guid'`,
  );

  if (guidCheck.length > 0) {
    console.log("[migrate] guid column already exists, skipping");
  } else {
    // Add guid as nullable with default, backfill, then set NOT NULL
    console.log("[migrate] Adding guid column...");
    await client.query(
      `ALTER TABLE apps ADD COLUMN guid UUID DEFAULT gen_random_uuid()`,
    );
    console.log("[migrate] Backfilling existing rows...");
    await client.query(
      `UPDATE apps SET guid = gen_random_uuid() WHERE guid IS NULL`,
    );
    console.log("[migrate] Setting NOT NULL constraint...");
    await client.query(`ALTER TABLE apps ALTER COLUMN guid SET NOT NULL`);
  }

  // Unique index on guid (idempotent)
  console.log("[migrate] Ensuring unique index on guid...");
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS apps_guid_unique ON apps (guid)`,
  );

  // Check if slug column already exists
  const { rows: slugCheck } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'apps' AND column_name = 'slug'`,
  );

  if (slugCheck.length > 0) {
    console.log("[migrate] slug column already exists, skipping");
  } else {
    console.log("[migrate] Adding slug column...");
    await client.query(`ALTER TABLE apps ADD COLUMN slug VARCHAR(100)`);
  }

  // Unique index on slug (idempotent)
  console.log("[migrate] Ensuring unique index on slug...");
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS apps_slug_unique ON apps (slug)`,
  );

  // Verify
  const { rows } = await client.query(
    `SELECT id, guid, slug FROM apps ORDER BY id LIMIT 5`,
  );
  console.log("[migrate] Sample data:", rows);

  await client.end();
  console.log("[migrate] Done.");
}

migrate().catch(async (err) => {
  console.error("[migrate] Failed:", err);
  await client.end().catch(() => {});
  process.exit(1);
});
