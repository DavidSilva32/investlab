import { studyListService } from "@/backend/services/study-list.service";

export class StudyListController {
  async list(requestId: string) {
    const entries = await studyListService.list(requestId);
    return Response.json({ entries, requestId });
  }

  async add(body: unknown, requestId: string) {
    const result = await studyListService.add(body, requestId);
    return Response.json(
      { ...result, requestId },
      { status: result.added ? 201 : 200 },
    );
  }

  async updateReason(issuerCnpj: string, body: unknown, requestId: string) {
    const result = await studyListService.updateReason(
      issuerCnpj,
      body,
      requestId,
    );
    return Response.json({ ...result, requestId });
  }

  async remove(issuerCnpj: string, requestId: string) {
    const result = await studyListService.remove(issuerCnpj, requestId);
    return Response.json({ ...result, requestId });
  }

  async addObservation(issuerCnpj: string, body: unknown, requestId: string) {
    const observation = await studyListService.addObservation(
      issuerCnpj,
      body,
      requestId,
    );
    return Response.json({ observation, requestId }, { status: 201 });
  }

  async updateObservation(
    issuerCnpj: string,
    observationId: string,
    body: unknown,
    requestId: string,
  ) {
    const observation = await studyListService.updateObservation(
      issuerCnpj,
      observationId,
      body,
      requestId,
    );
    return Response.json({ observation, requestId });
  }
}

export const studyListController = new StudyListController();
