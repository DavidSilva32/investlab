import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  url: "/api/openapi.json",
  pageTitle: "InvestLab API Reference",
  theme: "default",
  layout: "modern",
  hideDarkModeToggle: true,
  hideModels: false,
  cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4",
});
