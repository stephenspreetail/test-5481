#!/usr/bin/env bun
/**
 * Reset Database Script
 *
 * Drops all tables and recreates the schema from scratch.
 * WARNING: This will delete ALL data in the database.
 */

// Note: Bun automatically loads .env files - no dotenv needed
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

async function resetDatabase() {
  console.log('🔥 Starting database reset...');

  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Drop all objects in the public schema
    console.log('🗑️  Dropping all database objects...');

    // Drop all tables, views, sequences, functions, types, etc.
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables with CASCADE
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;

        -- Drop all views
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
        END LOOP;

        -- Drop all sequences
        FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
        END LOOP;

        -- Drop all functions
        FOR r IN (SELECT routines.routine_name, parameters.data_type
                  FROM information_schema.routines
                  LEFT JOIN information_schema.parameters ON routines.specific_name = parameters.specific_name
                  WHERE routines.specific_schema = 'public'
                  ORDER BY routines.routine_name, parameters.ordinal_position) LOOP
          EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.routine_name) || ' CASCADE';
        END LOOP;

        -- Drop all types
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    console.log('✅ All database objects dropped');
    console.log('📦 Schema will be recreated by drizzle-kit push');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetDatabase();
