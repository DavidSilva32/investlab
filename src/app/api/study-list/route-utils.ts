import { ApplicationError } from "@/backend/errors/application-error";

export async function parseStudyListJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApplicationError("Envie um corpo JSON válido.", 400);
  }
}
