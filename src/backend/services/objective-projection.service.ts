import { ApplicationError } from "@/backend/errors/application-error";
import {
  objectiveProjectionInputSchema,
  simulateObjectiveProjection,
} from "@/lib/objective-projection";
import type { ObjectiveProjectionResult } from "@/lib/objective-projection";

export class ObjectiveProjectionService {
  simulate(body: unknown): ObjectiveProjectionResult {
    const parsed = objectiveProjectionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os valores e as premissas da simulação.",
        400,
      );
    }
    try {
      return simulateObjectiveProjection(parsed.data);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new ApplicationError(
        "As premissas geram um valor fora do limite que podemos calcular.",
        400,
      );
    }
  }
}

export const objectiveProjectionService = new ObjectiveProjectionService();
