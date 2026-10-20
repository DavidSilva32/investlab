const publicBaseUrl =
  process.env.BETTER_AUTH_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const mcpResource = new URL("/api/mcp", publicBaseUrl).toString();

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const resourceUrl = new URL(mcpResource);
const documentationResource = localHosts.has(resourceUrl.hostname)
  ? "https://investlab-amber.vercel.app/api/mcp"
  : mcpResource;

export const mcpDocumentationResource = documentationResource;
