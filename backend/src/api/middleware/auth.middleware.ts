import { FastifyReply, FastifyRequest } from "fastify";

export interface JWTPayload {
  userId: number;
  email: string;
}

// Augment @fastify/jwt module to use our JWTPayload type
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload | undefined;
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const decoded = await request.jwtVerify<JWTPayload>();
    request.user = decoded;
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized" });
  }
}

/**
 * Optional auth middleware - extracts user if token present, but doesn't fail
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const decoded = await request.jwtVerify<JWTPayload>();
    request.user = decoded;
  } catch {
    // Token not present or invalid - continue without user
    request.user = undefined;
  }
}
