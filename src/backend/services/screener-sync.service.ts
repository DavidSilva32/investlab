import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  BrapiScreenerProvider,
  CvmDfpProvider,
  readCvmRegistry,
  type ScreenerFactRecord,
} from "@/backend/providers/screener-data.provider";
import {
  screenerSyncRepository,
  type ScreenerSecurityRecord,
  type ScreenerSyncRepository,
} from "@/backend/repositories/screener-sync.repository";
import { logger } from "@/infrastructure/logging/logger";

type BrapiProvider = Pick<BrapiScreenerProvider, "getCatalog" | "getProfile">;
type CvmProvider = {
  getRegistry(): ReturnType<typeof readCvmRegistry>;
  getAnnualFacts(
    year: number,
    registry: Map<string, string>,
  ): Promise<ScreenerFactRecord[]>;
};
type SyncRepository = Pick<
  ScreenerSyncRepository,
  "startRun" | "saveFullSync" | "markFailed"
> &
  Partial<Pick<ScreenerSyncRepository, "getStatus">>;

function chooseFact(
  current: ScreenerFactRecord | undefined,
  candidate: ScreenerFactRecord,
) {
  if (!current || candidate.version > current.version) return candidate;
  if (candidate.version < current.version) return current;
  if (candidate.sourceFile !== current.sourceFile)
    return candidate.sourceFile.localeCompare(current.sourceFile) < 0
      ? candidate
      : current;
  return candidate.sourceRow < current.sourceRow ? candidate : current;
}

export class ScreenerSyncService {
  constructor(
    private readonly brapi: BrapiProvider = new BrapiScreenerProvider(),
    private readonly cvm: CvmProvider = {
      getRegistry: readCvmRegistry,
      getAnnualFacts: (year, registry) =>
        new CvmDfpProvider().getAnnualFacts(year, registry),
    },
    private readonly repository: SyncRepository = screenerSyncRepository,
    private readonly currentYear = () => new Date().getUTCFullYear(),
  ) {}

  async status() {
    const status = await this.repository.getStatus?.();
    if (!status) return { hasSuccessfulSync: false, latestRun: null };
    const { hasSuccessfulSync, latestRun } = status;
    if (!latestRun) return { hasSuccessfulSync, latestRun: null };

    const errorMessages: Record<string, string> = {
      BRAPI_RATE_LIMIT: "A fonte de cotações atingiu o limite de consultas.",
      CVM_REGISTRY:
        "Não foi possível consultar o cadastro de emissores da CVM.",
      BRAPI_CATALOG: "Não foi possível consultar o catálogo de ativos.",
      BRAPI_PROFILES: "Não foi possível consultar os perfis dos ativos.",
      CVM_DFP:
        "Não foi possível consultar as demonstrações financeiras da CVM.",
      DATABASE_PERSIST: "Não foi possível salvar os dados sincronizados.",
    };
    const finishedAt = latestRun.completedAt ?? new Date();
    return {
      hasSuccessfulSync,
      latestRun: {
        status: latestRun.status,
        startedAt: latestRun.startedAt,
        completedAt: latestRun.completedAt,
        durationMs: Math.max(
          0,
          finishedAt.getTime() - latestRun.startedAt.getTime(),
        ),
        issuerCount: latestRun.issuerCount,
        securityCount: latestRun.securityCount,
        factCount: latestRun.factCount,
        errorMessage: latestRun.errorCode
          ? (errorMessages[latestRun.errorCode] ??
            "A sincronização foi interrompida.")
          : null,
      },
    };
  }
  async sync() {
    const runId = await this.repository.startRun(`screener:${randomUUID()}`);
    let stage = "cvm_registry";
    try {
      const registry = await this.cvm.getRegistry();
      stage = "brapi_catalog";
      const catalog = await this.brapi.getCatalog();
      let profilesConsulted = 0;
      const issuers = new Map<
        string,
        typeof registry extends Map<string, infer V> ? V : never
      >();
      const securities: ScreenerSecurityRecord[] = [];
      const baseSecurities = new Map<string, ScreenerSecurityRecord>();
      const fractional: typeof catalog = [];

      for (const stock of catalog) {
        if (!stock.active || stock.subtype !== "stock") continue;
        if (stock.ticker.endsWith("F")) {
          fractional.push(stock);
          continue;
        }
        stage = "brapi_profiles";
        profilesConsulted += 1;
        const profile = await this.brapi.getProfile(stock.ticker);
        if (
          profile.changed ||
          profile.ticker !== stock.ticker ||
          !profile.cnpj ||
          profile.cnpj.length !== 14
        )
          continue;
        const issuer = registry.get(profile.cnpj);
        if (!issuer || issuer.cnpj !== profile.cnpj) continue;
        issuers.set(issuer.cnpj, issuer);
        const security: ScreenerSecurityRecord = {
          ...stock,
          issuerCnpj: issuer.cnpj,
          baseTicker: null,
        };
        securities.push(security);
        baseSecurities.set(stock.ticker, security);
      }

      for (const alias of fractional) {
        const baseTicker = alias.ticker.slice(0, -1);
        const base = baseSecurities.get(baseTicker);
        if (!base) continue;
        securities.push({
          ...alias,
          issuerCnpj: base.issuerCnpj,
          baseTicker,
        });
      }

      stage = "cvm_dfp";
      const registryByCvmCode = new Map(
        [...issuers.values()].map((issuer) => [issuer.cvmCode, issuer.cnpj]),
      );
      const latestCompletedYear = this.currentYear() - 1;
      const firstYear = latestCompletedYear - 4;
      const factMap = new Map<string, ScreenerFactRecord>();
      for (let year = firstYear; year <= latestCompletedYear; year += 1) {
        const facts = await this.cvm.getAnnualFacts(year, registryByCvmCode);
        for (const fact of facts) {
          if (!issuers.has(fact.issuerCnpj)) continue;
          const key = [
            fact.issuerCnpj,
            fact.referenceDate,
            fact.accountCode,
            fact.documentType,
            fact.statementScope,
            fact.exerciseOrder,
          ].join(":");
          factMap.set(key, chooseFact(factMap.get(key), fact));
        }
      }
      stage = "database_persist";
      const facts = [...factMap.values()];
      await this.repository.saveFullSync({
        runId,
        catalogCount: catalog.length,
        profileCount: profilesConsulted,
        issuers: [...issuers.values()],
        securities,
        facts,
      });
      const result = {
        issuers: issuers.size,
        securities: securities.length,
        fractionalAliases: securities.filter(
          (security) => security.baseTicker !== null,
        ).length,
        facts: facts.length,
        eligibleIssuers: [...issuers.values()].filter(
          (issuer) => issuer.quantitativeEligible,
        ).length,
      };
      logger.info("screener_sync_completed", { runId, ...result });
      return result;
    } catch (error) {
      const errorCode =
        error instanceof ApplicationError && error.statusCode === 429
          ? "BRAPI_RATE_LIMIT"
          : stage.toUpperCase();
      await this.repository.markFailed(runId, errorCode).catch(() => undefined);
      logger.error("screener_sync_failed", {
        runId,
        stage,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "A sincronização do screener falhou. Uma nova execução completa pode ser iniciada manualmente.",
        502,
      );
    }
  }
}

export const screenerSyncService = new ScreenerSyncService();
