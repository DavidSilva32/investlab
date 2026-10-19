import { ApplicationError } from "@/backend/errors/application-error";

export function toolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text:
          error instanceof ApplicationError
            ? error.message
            : "Não foi possível concluir a operação no InvestLab.",
      },
    ],
  };
}
