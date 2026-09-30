import { createHash } from "node:crypto";

type ReserveAssetIdentity = {
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
};

const canonicalPart = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR") ?? "";

export function getEmergencyReserveAssetKey(position: ReserveAssetIdentity) {
  const identity = [
    position.product,
    position.assetCode,
    position.institution,
    position.issuer,
    position.indexer,
    position.regimeType,
    position.issuedAt,
    position.maturityAt,
  ].map(canonicalPart);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `v1:${fingerprint}`;
}
