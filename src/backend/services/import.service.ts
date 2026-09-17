import { createHash } from "node:crypto";
import { importFileSchema } from "@/backend/schemas/import.schema";
import { parseB3Xlsx } from "@/backend/services/b3-xlsx-parser";
import { ApplicationError } from "@/backend/errors/application-error";
export class ImportService {
  preview(file: { name: string; size: number; type: string; buffer: Buffer }) {
    importFileSchema.parse(file);
    return {
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      ...parseB3Xlsx(file.buffer, file.name),
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
