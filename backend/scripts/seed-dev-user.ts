/**
 * Seed script to create a development user and output tokens
 *
 * Usage: npx tsx scripts/seed-dev-user.ts
 *
 * Then copy the accessToken to browser localStorage:
 *   localStorage.setItem("accessToken", "<token>")
 *   localStorage.setItem("refreshToken", "<token>")
 */

import { config } from "dotenv";
config();

const API_URL = process.env.API_URL || "http://localhost:3002";
const DEV_USER = {
  email: "dev@kova.local",
  password: "devpassword123",
};

async function seedDevUser() {
  console.log("🌱 Seeding development user...\n");

  // Try to register first
  let response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEV_USER),
  });

  // If user exists, login instead
  if (response.status === 409) {
    console.log("User already exists, logging in...\n");
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEV_USER),
    });
  }

  if (!response.ok) {
    const error = await response.text();
    console.error("❌ Failed:", error);
    process.exit(1);
  }

  const data = await response.json();

  console.log("✅ Development user ready!\n");
  console.log("Email:", DEV_USER.email);
  console.log("Password:", DEV_USER.password);
  console.log("\n" + "=".repeat(60) + "\n");
  console.log("Run this in your browser console to authenticate:\n");
  console.log(`localStorage.setItem("accessToken", "${data.accessToken}");`);
  console.log(`localStorage.setItem("refreshToken", "${data.refreshToken}");`);
  console.log("\nThen refresh the page.");
  console.log("\n" + "=".repeat(60));
}

seedDevUser().catch(console.error);
