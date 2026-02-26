import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config/index.js";

interface EntraClaims {
  oid: string;
  email: string;
  preferred_username: string;
  roles?: string[];
}

class EntraAuthService {
  private get tenantId(): string {
    if (!config.ENTRA_TENANT_ID) throw new Error("ENTRA_TENANT_ID not configured");
    return config.ENTRA_TENANT_ID;
  }

  private get clientId(): string {
    if (!config.ENTRA_CLIENT_ID) throw new Error("ENTRA_CLIENT_ID not configured");
    return config.ENTRA_CLIENT_ID;
  }

  private get clientSecret(): string {
    if (!config.ENTRA_CLIENT_SECRET) throw new Error("ENTRA_CLIENT_SECRET not configured");
    return config.ENTRA_CLIENT_SECRET;
  }

  private get redirectUri(): string {
    if (!config.ENTRA_REDIRECT_URI) throw new Error("ENTRA_REDIRECT_URI not configured");
    return config.ENTRA_REDIRECT_URI;
  }

  /**
   * Build the Microsoft OAuth authorization URL.
   * stateJwt is a short-lived signed JWT used for CSRF protection.
   */
  getAuthorizationUrl(stateJwt: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: "openid profile email User.Read",
      state: stateJwt,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params}`;
  }

  /**
   * Exchange an authorization code for tokens via Microsoft token endpoint.
   */
  async exchangeCodeForTokens(code: string): Promise<{ idToken: string }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return { idToken: data["id_token"] as string };
  }

  /**
   * Validate the Microsoft ID token via JWKS.
   * Verifies signature, issuer, audience, and expiry.
   */
  async validateIdToken(idToken: string): Promise<EntraClaims> {
    const jwksUri = new URL(
      `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`,
    );
    const JWKS = createRemoteJWKSet(jwksUri);

    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
      audience: this.clientId,
    });

    const oid = payload["oid"] as string | undefined;
    const email = (payload["email"] ?? payload["preferred_username"]) as string | undefined;
    const preferred_username = payload["preferred_username"] as string | undefined;
    const roles = payload["roles"] as string[] | undefined;

    if (!oid) throw new Error("Missing oid claim in ID token");
    if (!email) throw new Error("Missing email claim in ID token");

    return { oid, email, preferred_username: preferred_username ?? email, roles };
  }
}

export const entraAuthService = new EntraAuthService();
