import { randomUUID } from "node:crypto";
import { getCurrentRequestId } from "@/infrastructure/logging/request-context";
import { logger } from "@/infrastructure/logging/logger";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { billingService } from "@/backend/services/billing.service";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";
import {
  ADMIN_SUPPORT_VIEW_COOKIE,
  adminSupportViewService,
  hasAdminSupportViewCookie,
  readAdminSupportViewToken,
} from "@/backend/services/admin-support-view.service";

type ApiHandler<Arguments extends unknown[]> = (
  ...arguments_: Arguments
) => Promise<Response>;

export function getApiRequestId(request?: Request) {
  const requestId = request?.headers.get("x-request-id");
  if (requestId && /^[a-zA-Z0-9._-]{1,128}$/.test(requestId)) return requestId;
  return getCurrentRequestId() ?? randomUUID();
}

function isOwnerScopedPrivateApi(route: string) {
  return (
    /^\/api\/(portfolio|imports|positions|emergency-reserve|recurring-expenses|cdb-rates|learning|billing)(\/|$)/.test(
      route,
    ) ||
    route.startsWith("/api/analyses/portfolio-opportunities") ||
    route.startsWith("/api/analyses/stocks/")
  );
}

function requiresCurrentTermsAcceptance(route: string) {
  return (
    route === "/api/auth/profile" || route.startsWith("/api/auth/profile/")
  );
}

function isSupportControlApi(method: string, route: string) {
  return (
    route === "/api/admin/support-view" &&
    ["GET", "POST", "DELETE"].includes(method)
  );
}

function isSupportLogout(method: string, route: string) {
  return method === "POST" && route === "/api/auth/logout";
}

const supportReadOnlyRoutes = new Set([
  "GET /api/portfolio",
  "GET /api/portfolio/monthly-review",
  "GET /api/portfolio/operations",
  "GET /api/portfolio/strategy",
  "GET /api/portfolio/allocation",
  "GET /api/portfolio/objectives",
  "GET /api/positions/manual",
  "GET /api/positions/reconciliation",
  "GET /api/learning/progress",
  "GET /api/emergency-reserve",
  "GET /api/recurring-expenses",
  "GET /api/analyses/portfolio-opportunities",
  "GET /api/analyses/stocks/search",
  "GET /api/analyses/stocks/[ticker]",
  "GET /api/analyses/stocks/[ticker]/manual-inputs",
  "GET /api/analyses/stocks/[ticker]/history",
  "GET /api/screener",
  "POST /api/analyses/companies/compare",
  "POST /api/analyses/stocks/[ticker]/valuation",
  "POST /api/emergency-reserve/suggestions",
  "POST /api/portfolio/chat/query",
  "POST /api/portfolio/contribution",
  "POST /api/portfolio/objectives/allocation/preview",
  "POST /api/portfolio/objectives/projection",
  "POST /api/portfolio/objectives/suggestions",
  "POST /api/portfolio/strategy/contribution",
]);

function isReadOnlySupportRequest(method: string, route: string) {
  return supportReadOnlyRoutes.has(`${method} ${route}`);
}

function isExpiredBeta(user: {
  role?: string | null;
  betaExpiresAt?: Date | null;
}) {
  return (
    user.role !== "ADMIN" &&
    user.betaExpiresAt instanceof Date &&
    user.betaExpiresAt.getTime() <= Date.now()
  );
}

function clearSupportCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `${ADMIN_SUPPORT_VIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function supportError(message: string, status: number, clearCookie = false) {
  const response = Response.json({ message }, { status });
  response.headers.set("Cache-Control", "no-store");
  return clearCookie ? clearSupportCookie(response) : response;
}

export function withApiRequestLogging<Arguments extends unknown[]>(
  method: string,
  route: string,
  handler: ApiHandler<Arguments>,
): ApiHandler<Arguments> {
  return async (...arguments_) => {
    const request =
      arguments_[0] instanceof Request ? arguments_[0] : undefined;
    const requestId = getApiRequestId(request);
    const startedAt = Date.now();

    return logger.withContext({ requestId }, async () => {
      logger.info("api_request_started", {
        method,
        route,
        module: route.split("/")[2] ?? "unknown",
      });

      try {
        const privateApi = isOwnerScopedPrivateApi(route);
        const protectedApi =
          privateApi || requiresCurrentTermsAcceptance(route);
        const adminRoute =
          route.startsWith("/api/admin/") ||
          route.startsWith("/api/settings/") ||
          route === "/api/screener/market/refresh";
        const supportCookiePresent = hasAdminSupportViewCookie(
          request?.headers,
        );
        const supportToken = readAdminSupportViewToken(request?.headers);
        const supportControlApi = isSupportControlApi(method, route);
        const supportLogout = isSupportLogout(method, route);
        let authenticatedUserId: string | null = null;
        let supportTargetUserId: string | null = null;
        let supportModeActive = false;

        if (supportCookiePresent && !supportControlApi && !supportLogout) {
          const user = await getAuthenticatedUser(request?.headers);
          if (!user) return supportError("Não autenticado.", 401, true);
          if (user.role !== "ADMIN")
            return supportError("Acesso não autorizado.", 403, true);
          const supportView = await adminSupportViewService.getActive(
            supportToken,
            user.id,
          );
          if (!supportView)
            return supportError(
              "O modo de suporte expirou ou não está mais disponível.",
              403,
              true,
            );
          if (adminRoute || !isReadOnlySupportRequest(method, route))
            return supportError(
              "Esta operação não está disponível durante a visualização de suporte.",
              403,
            );
          supportModeActive = true;
          if (privateApi) supportTargetUserId = supportView.targetUserId;
        }

        if (protectedApi || adminRoute) {
          const user = await getAuthenticatedUser(request?.headers);
          if (!user)
            return Response.json(
              { message: "Não autenticado." },
              { status: 401 },
            );
          if (!(await privacyCenterService.hasAcceptedCurrentTerms(user.id))) {
            return Response.json(
              {
                code: "TERMS_ACCEPTANCE_REQUIRED",
                message: "Aceite os Termos de Uso vigentes para continuar.",
              },
              {
                status: 428,
                headers: { "Cache-Control": "no-store" },
              },
            );
          }
          if (adminRoute && user.role !== "ADMIN") {
            return Response.json(
              { message: "Acesso não autorizado." },
              { status: 403 },
            );
          }
          const isWriteRequest = !["GET", "HEAD", "OPTIONS"].includes(
            method.toUpperCase(),
          );
          if (
            privateApi &&
            !route.startsWith("/api/billing") &&
            isExpiredBeta(user) &&
            isWriteRequest &&
            !isReadOnlySupportRequest(method.toUpperCase(), route) &&
            !(await billingService.hasPaidAccess(user.id))
          ) {
            const response = Response.json(
              {
                code: "BETA_ACCESS_EXPIRED",
                message:
                  "Seu período de acesso terminou. Seus dados continuam disponíveis para consulta.",
              },
              { status: 403, headers: { "Cache-Control": "no-store" } },
            );
            return response;
          }
          authenticatedUserId = supportTargetUserId ?? user.id;
        }

        const response = authenticatedUserId
          ? await runWithDataOwner(authenticatedUserId, () =>
              handler(...arguments_),
            )
          : await handler(...arguments_);
        if (supportModeActive)
          response.headers.set("Cache-Control", "no-store");
        response.headers.set("x-request-id", requestId);
        logger.info("api_request_completed", {
          method,
          route,
          module: route.split("/")[2] ?? "unknown",
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      } catch (error) {
        logger.error("api_request_failed", {
          method,
          route,
          module: route.split("/")[2] ?? "unknown",
          errorType: error instanceof Error ? error.name : "UnknownError",
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    });
  };
}
