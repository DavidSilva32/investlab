import { getApiMessage } from "@/lib/api-message";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequestWithResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback = "Não foi possível concluir a solicitação.",
): Promise<{ data: T; response: Response }> {
  const requestInit = {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  };
  let response: Response;
  try {
    response = init ? await fetch(input, requestInit) : await fetch(input);
  } catch {
    throw new ApiError(fallback, 0);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      fallback,
      response.ok ? 0 : response.status,
      response.headers?.get("retry-after") ?? null,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      getApiMessage(body, fallback),
      response.status,
      response.headers?.get("retry-after") ?? null,
    );
  }

  return { data: body as T, response };
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback = "Não foi possível concluir a solicitação.",
): Promise<T> {
  const { data } = await apiRequestWithResponse<T>(input, init, fallback);
  return data;
}
