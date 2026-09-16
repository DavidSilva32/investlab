import { createHash } from "node:crypto";

import { ApplicationError } from "@/backend/errors/application-error";
import { importFileSchema } from "@/backend/schemas/import.schema";
import { parseB3PositionXlsx } from "@/backend/services/b3-position-xlsx-parser";

export function previewImport(file: {
  name: string;
  size: number;
  type: string;
  buffer: Buffer;
}) {
  importFileSchema.parse(file);
  const positions = parseB3PositionXlsx(file.buffer);
  return {
    hash: createHash("sha256").update(file.buffer).digest("hex"),
    positions,
  };
}

export function assertImportCanBeConfirmed(isDuplicate: boolean) {
  if (isDuplicate)
    throw new ApplicationError(
      "Este arquivo já foi importado anteriormente.",
      409,
    );
}
