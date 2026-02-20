import { readFileSync } from "node:fs";
import { Signer } from "@aws-sdk/rds-signer";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config/index.js";
import * as schema from "./schema.js";

function createPool(): Pool {
  if (config.DB_AUTH_MODE === "iam") {
    const signer = new Signer({
      hostname: config.DB_HOST!,
      port: config.DB_PORT,
      username: config.DB_USER!,
      region: config.DB_REGION,
    });

    return new Pool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: () => signer.getAuthToken(),
      ssl: {
        rejectUnauthorized: true,
        ...(config.DB_SSL_CA_PATH && {
          ca: readFileSync(config.DB_SSL_CA_PATH, "utf8"),
        }),
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

const pool = createPool();

export const db = drizzle(pool, { schema });

export async function closeDatabase() {
  await pool.end();
}

export { schema };
