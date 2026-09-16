import { z } from "zod";

export const importFileSchema = z.object({
  name: z.string().endsWith(".xlsx", "Selecione um arquivo XLSX."),
  size: z
    .number()
    .positive()
    .max(5 * 1024 * 1024, "O arquivo deve ter até 5 MB."),
  type: z.string(),
});
