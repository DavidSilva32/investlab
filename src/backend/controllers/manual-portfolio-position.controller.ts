import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";

const idSchema = z.string().uuid();

export class ManualPortfolioPositionController {
  async list(requestId: string) {
    const positions = await manualPortfolioPositionService.list(requestId);
    return Response.json({ positions });
  }

  async create(request: Request, requestId: string) {
    const body = await this.readBody(request);
    const position = await manualPortfolioPositionService.create(
      body,
      requestId,
    );
    return Response.json({ position }, { status: 201 });
  }

  async update(request: Request, requestId: string) {
    const body = await this.readBody(request);
    const parsed = z.object({ id: idSchema }).passthrough().safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Identificador de posição inválido.", 400);
    const position = await manualPortfolioPositionService.update(
      parsed.data.id,
      body,
      requestId,
    );
    return Response.json({ position });
  }

  async delete(request: Request, requestId: string) {
    const body = await this.readBody(request);
    const parsed = z.object({ id: idSchema }).safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Identificador de posição inválido.", 400);
    const result = await manualPortfolioPositionService.delete(
      parsed.data.id,
      requestId,
    );
    return Response.json(result);
  }

  private async readBody(request: Request): Promise<unknown> {
    try {
      return await request.json();
    } catch {
      throw new ApplicationError("O corpo da solicitação é inválido.", 400);
    }
  }
}

export const manualPortfolioPositionController =
  new ManualPortfolioPositionController();
