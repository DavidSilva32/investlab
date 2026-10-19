import { authHandler } from "@/infrastructure/auth/auth";

export const runtime = "nodejs";

export const { GET, POST, PATCH, PUT, DELETE } = authHandler;
