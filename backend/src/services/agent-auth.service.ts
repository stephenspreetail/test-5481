/**
 * Agent API Authentication Service
 *
 * Generates and verifies JWT tokens for agent API access.
 * Each app container gets a unique token that authorizes API calls.
 */

import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

export interface AgentTokenPayload {
  appId: number;
  userId: number;
  type: "agent";
  iat?: number;
  exp?: number;
}

/**
 * Generate JWT token for agent API access
 * Token includes app ID and user ID claims
 * Expires in 30 days (long-lived for dev containers)
 */
export function generateAgentToken(appId: number, userId: number): string {
  const payload: AgentTokenPayload = {
    appId,
    userId,
    type: "agent",
  };

  const token = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: "30d",
  });

  return token;
}

/**
 * Verify and decode agent token
 * Returns payload if valid, null if invalid/expired
 */
export function verifyAgentToken(token: string): AgentTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AgentTokenPayload;

    // Validate token type
    if (decoded.type !== "agent") {
      console.warn(`[AgentAuth] Invalid token type: ${decoded.type}`);
      return null;
    }

    return decoded;
  } catch (error: any) {
    console.warn(`[AgentAuth] Token verification failed: ${error.message}`);
    return null;
  }
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 */
export function extractTokenFromHeader(
  authHeader: string | undefined
): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
