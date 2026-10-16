import { describe, expect, it } from "vitest";
import {
  getDataOwnerId,
  requireDataOwnerId,
  runWithDataOwner,
} from "@/infrastructure/auth/data-owner-context";

describe("request data-owner context", () => {
  it("isolates nested asynchronous operations and restores the outer owner", async () => {
    expect(getDataOwnerId()).toBeNull();
    await runWithDataOwner("owner-a", async () => {
      expect(getDataOwnerId()).toBe("owner-a");
      const nested = runWithDataOwner("owner-b", async () => {
        await Promise.resolve();
        return requireDataOwnerId();
      });
      expect(await nested).toBe("owner-b");
      expect(requireDataOwnerId()).toBe("owner-a");
    });
    expect(getDataOwnerId()).toBeNull();
  });

  it("rejects missing owners at context entry and repository access", () => {
    expect(() => runWithDataOwner("", () => "never runs")).toThrow(
      "A data owner is required for this operation.",
    );
    expect(() => requireDataOwnerId()).toThrow(
      "A data owner is required for this operation.",
    );
  });
});
