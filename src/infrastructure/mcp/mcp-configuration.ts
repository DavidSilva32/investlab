const publicBaseUrl =
  process.env.BETTER_AUTH_URL?.trim() ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const mcpResource = new URL("/api/mcp", publicBaseUrl).toString();
