import { openApiDocument } from "@/infrastructure/api/openapi-document";

export const GET = () =>
  Response.json(openApiDocument, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
