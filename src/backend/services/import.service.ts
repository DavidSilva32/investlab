import { createHash } from "node:crypto";

import { ApplicationError } from "@/backend/errors/application-error";
import { importFileSchema } from "@/backend/schemas/import.schema";
import { b3PositionXlsxParser } from "@/backend/services/b3-position-xlsx-parser";

export class ImportService {
  preview(file: { name: string; size: number; type: string; buffer: Buffer }) {
    importFileSchema.parse(file);
    const positions = b3PositionXlsxParser.parse(file.buffer);
    return {
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      positions,
    };
  }

  assertCanBeConfirmed(isDuplicate: boolean) {
    if (isDuplicate)
      throw new ApplicationError(
        "Este arquivo já foi importado anteriormente.",
        409,
      );
  }
}

export const importService = new ImportService();
