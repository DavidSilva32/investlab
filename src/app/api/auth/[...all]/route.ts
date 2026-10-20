export const runtime = "nodejs";

type AuthMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function handleAuthRequest(request: Request, method: AuthMethod) {
  const { authHandler } = await import("@/infrastructure/auth/auth");
  return authHandler[method](request);
}

export const GET = (request: Request) => handleAuthRequest(request, "GET");
export const POST = (request: Request) => handleAuthRequest(request, "POST");
export const PATCH = (request: Request) => handleAuthRequest(request, "PATCH");
export const PUT = (request: Request) => handleAuthRequest(request, "PUT");
export const DELETE = (request: Request) =>
  handleAuthRequest(request, "DELETE");
