import { z } from "zod";

export const importFileSchema = z.object({
  name: z.string().endsWith(".xlsx", "Selecione um arquivo XLSX."),
  size: z
    .number()
    .positive()
    .max(5 * 1024 * 1024, "O arquivo deve ter até 5 MB."),
  type: z.string(),
});

export const positionReferenceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data de referência vêlida.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Informe uma data de referência vêlida.");
