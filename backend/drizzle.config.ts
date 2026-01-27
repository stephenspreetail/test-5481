// Note: Bun automatically loads .env files - no dotenv needed
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://kova:kova_dev_password@localhost:5433/kova",
  },
});
