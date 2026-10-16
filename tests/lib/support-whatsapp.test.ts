import { describe, expect, it } from "vitest";

import { getSupportWhatsAppUrl } from "@/lib/support-whatsapp";

describe("getSupportWhatsAppUrl", () => {
  it("uses the Brazil country code for the configured local support number", () => {
    const url = getSupportWhatsAppUrl("21986721163");

    expect(url).toMatch(/^https:\/\/wa\.me\/5521986721163\?text=/);
  });

  it("also accepts a ten-digit Brazilian local number", () => {
    expect(getSupportWhatsAppUrl("2133332222")).toMatch(
      /^https:\/\/wa\.me\/552133332222\?text=/,
    );
  });

  it("accepts an international number and pre-fills only a neutral support request", () => {
    const url = getSupportWhatsAppUrl("5521986721163");

    expect(url).toContain("wa.me/5521986721163?");
    expect(decodeURIComponent(url ?? "")).toContain(
      "Posso confirmar minha identidade por um canal confiável.",
    );
    expect(decodeURIComponent(url ?? "")).not.toContain("senha:");
    expect(decodeURIComponent(url ?? "")).not.toContain("@gmail.com");
  });

  it.each([undefined, "", "123", "1234567890123456"])(
    "returns no link for absent or invalid configuration (%s)",
    (phone) => {
      expect(getSupportWhatsAppUrl(phone)).toBeNull();
    },
  );

  it.each([
    "21 986721163",
    "+5521986721163",
    "55-21986721163",
    "05521986721163",
    "abc21986721163",
  ])("rejects malformed support numbers (%s)", (phone) => {
    expect(getSupportWhatsAppUrl(phone)).toBeNull();
  });
});
