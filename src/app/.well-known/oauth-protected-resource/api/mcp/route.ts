import { auth } from "@/infrastructure/auth/auth";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/auth/.well-known/oauth-protected-resource/api/mcp";
  return auth.handler(new Request(url, { headers: request.headers }));
}
