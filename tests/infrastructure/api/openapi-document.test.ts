import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "@/infrastructure/api/openapi-document";

describe("InvestLab OpenAPI document", () => {
  it("validates against the OpenAPI schema and describes the intended REST scope", async () => {
    await expect(
      SwaggerParser.validate(JSON.parse(JSON.stringify(openApiDocument))),
    ).resolves.toMatchObject({
      openapi: "3.0.3",
      info: { title: "InvestLab API", version: "1.0.0" },
    });

    expect(Object.keys(openApiDocument.paths)).toEqual(
      expect.arrayContaining([
        "/api/portfolio",
        "/api/portfolio/objectives",
        "/api/portfolio/objectives/balance",
        "/api/positions/manual",
        "/api/imports",
        "/api/imports/preview",
        "/api/imports/confirm",
        "/api/imports/reconciliation",
        "/api/portfolio/monthly-review",
      ]),
    );
    expect(openApiDocument.info.description).toContain("mcp:write");
    expect(openApiDocument.info.description).toContain(
      "MCP é um protocolo próprio",
    );
    expect(openApiDocument.paths).not.toHaveProperty("/api/admin/users");
  });

  it("describes distinct mutation/read schemas and B3 preview variants", () => {
    const objectives = openApiDocument.paths["/api/portfolio/objectives"];
    const imports = openApiDocument.paths["/api/imports"];
    const previewSchema = openApiDocument.components.schemas.ImportPreview;

    expect(objectives.post?.responses).not.toHaveProperty("409");
    expect(objectives.put?.responses).not.toHaveProperty("409");
    expect(
      objectives.post?.responses["201"].content["application/json"].schema,
    ).toEqual({ $ref: "#/components/schemas/ObjectiveRecord" });
    expect(imports.delete?.responses["409"]).toBeDefined();
    expect(previewSchema.oneOf).toHaveLength(3);
    expect(previewSchema.discriminator.propertyName).toBe("documentType");
  });
});
