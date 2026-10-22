import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/backend/controllers/learning-course-progress.controller", () => ({
  learningCourseProgressController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (
    _method: string,
    _route: string,
    handler: (request?: Request) => Promise<Response>,
  ) => handler,
}));

import { GET, PUT } from "@/app/api/learning/progress/route";

describe("learning course progress route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the authenticated owner's course progress through the controller", async () => {
    controller.list.mockResolvedValue(
      Response.json({ courses: [{ courseId: "fiis" }] }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      courses: [{ courseId: "fiis" }],
    });
    expect(controller.list).toHaveBeenCalledOnce();
  });

  it("forwards progress saves to the controller", async () => {
    const request = new Request("http://test/api/learning/progress", {
      method: "PUT",
      body: JSON.stringify({ courseId: "fiis", lastLessonId: "lesson-1" }),
    });
    controller.save.mockResolvedValue(
      Response.json({ progress: { courseId: "fiis" }, assessment: null }),
    );

    const response = await PUT(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      progress: { courseId: "fiis" },
    });
    expect(controller.save).toHaveBeenCalledWith(request);
  });
});
