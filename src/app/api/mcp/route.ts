import { createInsufficientScopeError } from "better-auth/oauth2";
import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "@/infrastructure/auth/auth";
import { mcpController } from "@/backend/controllers/mcp.controller";
import { mcpResource } from "@/infrastructure/mcp/mcp-configuration";

export const runtime = "nodejs";

function scopeSet(claims: { scope?: unknown; scp?: unknown }) {
  const scope = claims.scope ?? claims.scp;
  return new Set(
    Array.isArray(scope)
      ? scope.filter((value): value is string => typeof value === "string")
      : typeof scope === "string"
        ? scope.split(/\s+/).filter(Boolean)
        : [],
  );
}

async function handleAuthenticatedRequest(
  request: Request,
  claims: { sub?: unknown; scope?: unknown; scp?: unknown },
) {
  const payload: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  const toolName =
    payload !== null &&
    typeof payload === "object" &&
    "method" in payload &&
    payload.method === "tools/call" &&
    "params" in payload &&
    payload.params !== null &&
    typeof payload.params === "object" &&
    "name" in payload.params &&
    typeof payload.params.name === "string"
      ? payload.params.name
      : null;
  if (
    toolName !== null &&
    toolName.startsWith("admin_") &&
    !scopeSet(claims).has("mcp:admin:read")
  ) {
    throw createInsufficientScopeError(["mcp:admin:read"]);
  }
  return mcpController.handle(request, claims);
}

export const POST = requireMcpAuth(auth, handleAuthenticatedRequest, {
  resource: mcpResource,
  requiredScopes: ["mcp:read"],
  challengeScopes: ["mcp:read"],
});
