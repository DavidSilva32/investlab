export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/.well-known/oauth-protected-resource/api/mcp";
  const { auth } = await import("@/infrastructure/auth/auth");
  return auth.handler(new Request(url, { headers: request.headers }));
}
