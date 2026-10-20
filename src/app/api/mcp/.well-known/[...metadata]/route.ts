import { auth } from "@/infrastructure/auth/auth";

export const runtime = "nodejs";

const metadataRoutes = new Map([
  ["oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"],
  [
    "oauth-authorization-server",
    "/.well-known/oauth-authorization-server/api/auth",
  ],
]);

async function forwardMetadata(request: Request, metadata: string[]) {
  const key = metadata.join("/");
  const targetPath = metadataRoutes.get(key);
  if (!targetPath) return new Response(null, { status: 404 });

  const targetUrl = new URL(request.url);
  targetUrl.pathname = targetPath;
  return auth.handler(
    new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
    }),
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ metadata: string[] }> },
) {
  return forwardMetadata(request, (await context.params).metadata);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ metadata: string[] }> },
) {
  return forwardMetadata(request, (await context.params).metadata);
}
