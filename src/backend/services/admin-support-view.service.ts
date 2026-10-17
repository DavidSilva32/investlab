import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { adminSupportViewRepository } from "@/backend/repositories/admin-support-view.repository";
import { getAuthSecret } from "@/infrastructure/auth/auth-configuration";
import { requireRole } from "@/infrastructure/auth/authorization";

export const ADMIN_SUPPORT_VIEW_COOKIE = "investlab-support-view";
export const ADMIN_SUPPORT_VIEW_DURATION_MS = 30 * 60 * 1000;

type SupportViewPayload = {
  actorUserId: string;
  targetUserId: string;
  expiresAt: number;
};

function sign(encodedPayload: string) {
  return createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function encodePayload(payload: SupportViewPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodePayload(token: string): SupportViewPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  let expectedSignature: string;
  try {
    expectedSignature = sign(encodedPayload);
  } catch {
    return null;
  }
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SupportViewPayload>;
    if (
      typeof payload.actorUserId !== "string" ||
      typeof payload.targetUserId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isSafeInteger(payload.expiresAt)
    )
      return null;
    return payload as SupportViewPayload;
  } catch {
    return null;
  }
}

export function readAdminSupportViewToken(headers: Headers | undefined) {
  const cookie = headers?.get("cookie");
  if (!cookie) return null;
  const prefix = `${ADMIN_SUPPORT_VIEW_COOKIE}=`;
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value && /^[A-Za-z0-9_.-]{20,512}$/.test(value) ? value : null;
}

export function hasAdminSupportViewCookie(headers: Headers | undefined) {
  return Boolean(
    headers
      ?.get("cookie")
      ?.split(";")
      .some((part) => part.trim().startsWith(`${ADMIN_SUPPORT_VIEW_COOKIE}=`)),
  );
}

export class AdminSupportViewService {
  async listTargets(headers?: Headers) {
    const actor = await requireRole("ADMIN", headers);
    const result = await adminSupportViewRepository.listTargets(actor.id);
    if (result.kind === "actor-not-authorized")
      throw new ApplicationError("Acesso não autorizado.", 403);
    return result.targets;
  }

  async start(targetUserId: string, headers?: Headers) {
    const actor = await requireRole("ADMIN", headers);
    const result = await adminSupportViewRepository.getActiveTarget(
      actor.id,
      targetUserId,
    );
    if (result.kind === "actor-not-authorized")
      throw new ApplicationError("Acesso não autorizado.", 403);
    if (result.kind === "target-not-found")
      throw new ApplicationError("A conta não está disponível.", 404);
    const expiresAt = Date.now() + ADMIN_SUPPORT_VIEW_DURATION_MS;
    return {
      token: encodePayload({
        actorUserId: actor.id,
        targetUserId,
        expiresAt,
      }),
      target: result.target,
      expiresAt: new Date(expiresAt),
    };
  }

  async getActive(token: string | null, actorUserId: string) {
    if (!token) return null;
    const payload = decodePayload(token);
    if (
      !payload ||
      payload.actorUserId !== actorUserId ||
      payload.expiresAt <= Date.now()
    )
      return null;
    const result = await adminSupportViewRepository.getActiveTarget(
      actorUserId,
      payload.targetUserId,
    );
    if (result.kind !== "found") return null;
    return {
      actorUserId,
      targetUserId: result.target.id,
      targetName: result.target.name,
      targetEmail: result.target.email,
      expiresAt: new Date(payload.expiresAt),
    };
  }
}

export const adminSupportViewService = new AdminSupportViewService();
