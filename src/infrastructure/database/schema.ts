import { and, eq, lt, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const imports = pgTable("imports", {
  id: uuid().defaultRandom().primaryKey(),
  origin: varchar({ length: 40 }).notNull().default("B3"),
  documentType: varchar({ length: 40 }).notNull().default("B3_POSITION_XLSX"),
  fileName: text().notNull(),
  fileHash: varchar({ length: 64 }).notNull().unique(),
  referenceDate: date(),
  estimationBaseDate: date(),
  status: varchar({ length: 20 }).notNull().default("CONFIRMED"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const positionSnapshots = pgTable("position_snapshots", {
  id: uuid().defaultRandom().primaryKey(),
  importId: uuid()
    .notNull()
    .unique()
    .references(() => imports.id),
  referenceDate: date(),
  estimationBaseDate: date(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const positionItems = pgTable("position_items", {
  id: uuid().defaultRandom().primaryKey(),
  snapshotId: uuid()
    .notNull()
    .references(() => positionSnapshots.id),
  product: text().notNull(),
  institution: text(),
  issuer: text(),
  assetCode: text(),
  indexer: text(),
  regimeType: text(),
  issuedAt: date(),
  maturityAt: date(),
  quantity: numeric({ precision: 24, scale: 8 }).notNull(),
  availableQuantity: numeric({ precision: 24, scale: 8 }),
  unavailableQuantity: numeric({ precision: 24, scale: 8 }),
  unitPrice: numeric({ precision: 24, scale: 8 }),
  totalValue: numeric({ precision: 24, scale: 8 }),
  valuationSource: varchar({ length: 20 }),
  mtmUnitPrice: numeric({ precision: 24, scale: 8 }),
  mtmTotalValue: numeric({ precision: 24, scale: 8 }),
  curveUnitPrice: numeric({ precision: 24, scale: 8 }),
  curveTotalValue: numeric({ precision: 24, scale: 8 }),
  closingUnitPrice: numeric({ precision: 24, scale: 8 }),
  closingTotalValue: numeric({ precision: 24, scale: 8 }),
  source: varchar({ length: 40 }).notNull().default("B3"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const treasuryLiquidityRules = pgTable("treasury_liquidity_rules", {
  id: uuid().defaultRandom().primaryKey(),
  version: varchar({ length: 80 }).notNull().unique(),
  sourceUrl: text().notNull(),
  sourceTitle: text().notNull(),
  observedAt: date().notNull(),
  effectiveFrom: date().notNull(),
  effectiveTo: date(),
  terms: jsonb()
    .$type<{
      instrumentType: string;
      identityMethod: string;
      regulatoryBasis: {
        sourceUrl: string;
        sourceTitle: string;
        effectiveFrom: string;
      };
      settlementWindows: Array<{
        requestWindow: string;
        relativeSettlement: string;
      }>;
    }>()
    .notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const treasuryPositionLiquidityFacts = pgTable(
  "treasury_position_liquidity_facts",
  {
    id: uuid().defaultRandom().primaryKey(),
    positionItemId: uuid()
      .notNull()
      .references(() => positionItems.id, { onDelete: "cascade" }),
    snapshotId: uuid()
      .notNull()
      .references(() => positionSnapshots.id, { onDelete: "cascade" }),
    ruleVersion: varchar({ length: 80 })
      .notNull()
      .references(() => treasuryLiquidityRules.version),
    status: varchar({ length: 16 }).notNull(),
    reasons: jsonb().$type<string[]>().notNull(),
    asOf: date().notNull(),
    normalizedTitleType: varchar({ length: 40 }),
    maturityAt: date(),
    positionQuantity: numeric({ precision: 24, scale: 8 }).notNull(),
    availableQuantity: numeric({ precision: 24, scale: 8 }),
    unavailableQuantity: numeric({ precision: 24, scale: 8 }),
    institution: text(),
    assetCode: text(),
    settlementEstimate: jsonb().$type<{
      condition: "normal_operation";
      windows: Array<{
        requestWindow: string;
        relativeSettlement: string;
      }>;
      exclusions: string[];
    } | null>(),
    source: varchar({ length: 40 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("treasury_position_liquidity_position_uidx").on(
      table.positionItemId,
    ),
    index("treasury_position_liquidity_snapshot_idx").on(table.snapshotId),
  ],
);

export const manualPortfolioPositions = pgTable("manual_portfolio_positions", {
  id: uuid().defaultRandom().primaryKey(),
  assetKey: varchar({ length: 64 }).notNull().unique(),
  product: text().notNull(),
  assetCode: varchar({ length: 24 }),
  institution: text(),
  quantity: numeric({ precision: 24, scale: 8 }).notNull(),
  currency: varchar({ length: 3 }).notNull(),
  unitPrice: numeric({ precision: 24, scale: 8 }),
  totalValue: numeric({ precision: 24, scale: 8 }).notNull(),
  valueBasis: varchar({ length: 16 }).notNull(),
  positionDate: date().notNull(),
  convertedValueBrl: numeric({ precision: 24, scale: 8 }),
  conversionDate: date(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const cdbRateConfigurations = pgTable("cdb_rate_configurations", {
  id: uuid().defaultRandom().primaryKey(),
  assetCode: text().notNull().unique(),
  cdiPercentage: numeric({ precision: 9, scale: 4 }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const emergencyReserveSettings = pgTable("emergency_reserve_settings", {
  id: varchar({ length: 20 }).primaryKey().default("default"),
  monthlyExpenses: numeric({ precision: 18, scale: 2 }),
  targetMonths: integer(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
/* v8 ignore start -- Drizzle table declarations are declarative schema metadata. */
export const portfolioObjectives = pgTable(
  "portfolio_objectives",
  {
    id: uuid().defaultRandom().primaryKey(),
    kind: varchar({ length: 16 }).notNull().default("CUSTOM"),
    purpose: varchar({ length: 32 }),
    name: varchar({ length: 120 }).notNull(),
    targetAmount: numeric({ precision: 18, scale: 2 }),
    monthlyPlannedAmount: numeric({ precision: 18, scale: 2 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("portfolio_objectives_kind_created_idx").on(
      table.kind,
      table.createdAt,
    ),
  ],
);
export const portfolioObjectivePositions = pgTable(
  "portfolio_objective_positions",
  {
    id: uuid().defaultRandom().primaryKey(),
    objectiveId: uuid()
      .notNull()
      .references(() => portfolioObjectives.id, { onDelete: "cascade" }),
    assetKey: varchar({ length: 80 }).notNull().unique(),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("portfolio_objective_positions_objective_idx").on(table.objectiveId),
  ],
);
/* v8 ignore stop */
/* v8 ignore start -- Drizzle table declarations are declarative schema metadata. */
export const portfolioObjectiveReferenceBatches = pgTable(
  "portfolio_objective_reference_batches",
  {
    id: uuid().defaultRandom().primaryKey(),
    observedOn: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);
export const portfolioObjectiveBalanceReferences = pgTable(
  "portfolio_objective_balance_references",
  {
    id: uuid().defaultRandom().primaryKey(),
    batchId: uuid()
      .notNull()
      .references(() => portfolioObjectiveReferenceBatches.id, {
        onDelete: "cascade",
      }),
    objectiveId: uuid()
      .notNull()
      .references(() => portfolioObjectives.id, { onDelete: "cascade" }),
    amountCents: numeric({ precision: 20, scale: 0 }).notNull(),
    cdiPercentage: numeric({ precision: 9, scale: 4 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "portfolio_objective_balance_reference_amount_nonnegative_chk",
      sql`${table.amountCents} >= 0`,
    ),
    uniqueIndex(
      "portfolio_objective_balance_reference_batch_objective_uidx",
    ).on(table.batchId, table.objectiveId),
    index("portfolio_objective_balance_reference_objective_created_idx").on(
      table.objectiveId,
      table.createdAt,
    ),
  ],
);
/* v8 ignore stop */
export const portfolioAllocationTargets = pgTable(
  "portfolio_allocation_targets",
  {
    id: varchar({ length: 20 }).primaryKey().default("default"),
    percentages: jsonb().$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);
export const personalInvestmentStrategy = pgTable(
  "personal_investment_strategy",
  {
    id: varchar({ length: 20 }).primaryKey().default("default"),
    answers: jsonb().$type<{
      horizonYears: number;
      internationalInterest: "interested" | "not_interested" | "unsure";
    }>(),
    selectedDirection: varchar({ length: 40 }),
    allocationPercentages: jsonb().$type<Record<string, number> | null>(),
    allocationActive: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);
export const cdiDailyRates = pgTable("cdi_daily_rates", {
  rateDate: date().primaryKey(),
  annualRate: numeric({ precision: 9, scale: 6 }).notNull(),
  fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const movementItems = pgTable("movement_items", {
  id: uuid().defaultRandom().primaryKey(),
  importId: uuid()
    .notNull()
    .references(() => imports.id),
  eventFingerprint: varchar({ length: 32 }).notNull().unique(),
  direction: varchar({ length: 10 }).notNull(),
  occurredAt: date().notNull(),
  movementType: text().notNull(),
  product: text().notNull(),
  assetCode: text(),
  institution: text(),
  quantity: numeric({ precision: 24, scale: 8 }).notNull(),
  unitPrice: numeric({ precision: 24, scale: 8 }),
  operationValue: numeric({ precision: 24, scale: 8 }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const stockFundamentals = pgTable("stock_fundamentals", {
  id: uuid().defaultRandom().primaryKey(),
  ticker: varchar({ length: 16 }).notNull(),
  cnpj: varchar({ length: 14 }).notNull(),
  periodType: varchar({ length: 12 }).notNull(),
  referenceDate: date().notNull(),
  revenue: numeric({ precision: 24, scale: 2 }),
  netIncome: numeric({ precision: 24, scale: 2 }),
  equity: numeric({ precision: 24, scale: 2 }),
  assets: numeric({ precision: 24, scale: 2 }),
  liabilities: numeric({ precision: 24, scale: 2 }),
  cash: numeric({ precision: 24, scale: 2 }),
  debt: numeric({ precision: 24, scale: 2 }),
  sourceDocument: varchar({ length: 8 }).notNull(),
  sourceVersion: varchar({ length: 32 }).notNull(),
  fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const screenerMarketRefreshRuns = pgTable(
  "screener_market_refresh_runs",
  {
    id: uuid().defaultRandom().primaryKey(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    attemptedIssuers: integer().notNull().default(0),
    updatedIssuers: integer().notNull().default(0),
    unavailableIssuers: integer().notNull().default(0),
    skippedFreshIssuers: integer().notNull().default(0),
    status: varchar({ length: 20 }).notNull().default("RUNNING"),
  },
  (table) => [
    uniqueIndex("screener_market_refresh_running_uidx")
      .on(table.status)
      .where(sql`${table.status} = 'RUNNING'`),
  ],
);

export const screenerIngestionRuns = pgTable("screener_ingestion_runs", {
  id: uuid().defaultRandom().primaryKey(),
  runKey: varchar({ length: 160 }).notNull().unique(),
  status: varchar({ length: 16 }).notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp({ withTimezone: true }),
  catalogCount: integer(),
  profileCount: integer(),
  issuerCount: integer(),
  securityCount: integer(),
  factCount: integer(),
  errorCode: varchar({ length: 80 }),
});

export const screenerIssuers = pgTable("screener_issuers", {
  cnpj: varchar({ length: 14 }).primaryKey(),
  cvmCode: varchar({ length: 12 }).notNull().unique(),
  name: text().notNull(),
  sector: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const screenerSecurities = pgTable(
  "screener_securities",
  {
    ticker: varchar({ length: 16 }).primaryKey(),
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => screenerIssuers.cnpj, { onDelete: "cascade" }),
    name: text().notNull(),
    subType: varchar({ length: 16 }).notNull(),
    isActive: boolean().notNull(),
    baseTicker: varchar({ length: 16 }),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("screener_securities_issuer_idx").on(table.issuerCnpj)],
);

export const screenerFinancialFacts = pgTable(
  "screener_financial_facts",
  {
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => screenerIssuers.cnpj, { onDelete: "cascade" }),
    referenceDate: date().notNull(),
    accountCode: varchar({ length: 24 }).notNull(),
    accountLabel: text(),
    value: numeric({ precision: 26, scale: 2 }).notNull(),
    documentType: varchar({ length: 8 }).notNull(),
    statementScope: varchar({ length: 16 }).notNull(),
    exerciseOrder: varchar({ length: 16 }).notNull(),
    version: integer().notNull(),
    sourceFile: varchar({ length: 160 }).notNull(),
    sourceRow: integer().notNull(),
    ingestionRunId: uuid()
      .notNull()
      .references(() => screenerIngestionRuns.id),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("screener_facts_identity_uidx").on(
      table.issuerCnpj,
      table.referenceDate,
      table.accountCode,
      table.documentType,
      table.statementScope,
      table.exerciseOrder,
    ),
    index("screener_facts_run_idx").on(table.ingestionRunId),
  ],
);

export const cvmShareCapitalFacts = pgTable(
  "cvm_share_capital_facts",
  {
    factKey: varchar({ length: 64 }).primaryKey(),
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => screenerIssuers.cnpj, { onDelete: "cascade" }),
    ingestionRunId: uuid()
      .notNull()
      .references(() => screenerIngestionRuns.id),
    referenceDate: date(),
    documentVersion: integer().notNull(),
    documentId: varchar({ length: 32 }).notNull(),
    documentReceivedDate: date(),
    metadataStatus: varchar({ length: 16 }).notNull(),
    recordKind: varchar({ length: 40 }).notNull(),
    capitalId: varchar({ length: 32 }),
    shareholderId: varchar({ length: 32 }),
    sourceArchive: varchar({ length: 64 }).notNull(),
    sourceFile: varchar({ length: 128 }).notNull(),
    sourceRow: integer().notNull(),
    rawFields: jsonb().$type<Record<string, string>>().notNull(),
    tickerClassStatus: varchar({ length: 16 }).notNull(),
    quantitySemantics: varchar({ length: 64 }).notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("cvm_share_capital_issuer_reference_idx").on(
      table.issuerCnpj,
      table.referenceDate,
    ),
    index("cvm_share_capital_document_idx").on(
      table.issuerCnpj,
      table.documentId,
      table.documentVersion,
    ),
    index("cvm_share_capital_received_idx").on(table.documentReceivedDate),
    index("cvm_share_capital_run_idx").on(table.ingestionRunId),
  ],
);

export const cvmShareClassReconciliations = pgTable(
  "cvm_share_class_reconciliations",
  {
    id: uuid().defaultRandom().primaryKey(),
    ingestionRunId: uuid()
      .notNull()
      .references(() => screenerIngestionRuns.id),
    issuerCnpj: varchar({ length: 14 }).references(() => screenerIssuers.cnpj, {
      onDelete: "cascade",
    }),
    ticker: varchar({ length: 16 }).notNull(),
    instrumentSubtype: varchar({ length: 16 }).notNull(),
    issuerIdentityStatus: varchar({ length: 16 }).notNull(),
    tickerClassStatus: varchar({ length: 16 }).notNull(),
    unitCompositionStatus: varchar({ length: 16 }).notNull(),
    freDocumentAlignmentStatus: varchar({ length: 16 }).notNull(),
    crossSourceAlignmentStatus: varchar({ length: 16 }).notNull(),
    effectiveDateStatus: varchar({ length: 16 }).notNull(),
    eventHistoryStatus: varchar({ length: 16 }).notNull(),
    treasuryStatus: varchar({ length: 32 }).notNull(),
    reasons: jsonb().$type<string[]>().notNull(),
    evidence: jsonb()
      .$type<
        Array<{
          factKey: string;
          recordKind: string;
          documentId: string;
          documentVersion: number;
          referenceDate: string | null;
          documentReceivedDate: string | null;
          sourceArchive: string;
          sourceFile: string;
          sourceRow: number;
          quantitySemantics: string;
        }>
      >()
      .notNull(),
    reconciledAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("cvm_share_class_run_ticker_uidx").on(
      table.ingestionRunId,
      table.ticker,
    ),
    index("cvm_share_class_issuer_idx").on(table.issuerCnpj, table.ticker),
  ],
);

export const screenerMarketSnapshots = pgTable(
  "screener_market_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => screenerIssuers.cnpj, { onDelete: "cascade" }),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    quoteObservedAt: timestamp({ withTimezone: true }),
    marketCap: numeric({ precision: 26, scale: 2 }),
    price: numeric({ precision: 24, scale: 8 }),
    sourceTicker: varchar({ length: 16 }).notNull(),
    classSemanticsValidated: boolean().notNull().default(false),
    ingestionRunId: uuid().references(() => screenerIngestionRuns.id),
    marketRefreshRunId: uuid().references(() => screenerMarketRefreshRuns.id),
  },
  (table) => [
    index("screener_market_issuer_observed_idx").on(
      table.issuerCnpj,
      table.observedAt,
    ),
  ],
);

export const screenerMarketSnapshotQuotes = pgTable(
  "screener_market_snapshot_quotes",
  {
    id: uuid().defaultRandom().primaryKey(),
    snapshotId: uuid()
      .notNull()
      .references(() => screenerMarketSnapshots.id, { onDelete: "cascade" }),
    requestedTicker: varchar({ length: 16 }).notNull(),
    returnedTicker: varchar({ length: 16 }).notNull(),
    price: numeric({ precision: 24, scale: 8 }),
    marketCap: numeric({ precision: 26, scale: 2 }),
    quoteObservedAt: timestamp({ withTimezone: true }),
    validationResult: varchar({ length: 40 }).notNull(),
  },
  (table) => [
    index("screener_market_snapshot_quotes_snapshot_idx").on(table.snapshotId),
  ],
);

export const studyListEntries = pgTable("study_list_entries", {
  issuerCnpj: varchar({ length: 14 }).primaryKey(),
  companyName: text().notNull(),
  ticker: varchar({ length: 16 }),
  reason: text().notNull(),
  addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const studyListObservations = pgTable(
  "study_list_observations",
  {
    id: uuid().defaultRandom().primaryKey(),
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => studyListEntries.issuerCnpj, { onDelete: "cascade" }),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("study_list_observations_entry_created_idx").on(
      table.issuerCnpj,
      table.createdAt,
    ),
  ],
);
export const portfolioAssetClassifications = pgTable(
  "portfolio_asset_classifications",
  {
    assetKey: varchar({ length: 64 }).primaryKey(),
    assetClass: varchar({ length: 80 }),
    subClass: varchar({ length: 120 }),
    geography: varchar({ length: 40 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);

/* v8 ignore start -- Drizzle table declarations are declarative schema metadata. */
export const valuationAccountingFacts = pgTable(
  "valuation_accounting_facts",
  {
    id: uuid().defaultRandom().primaryKey(),
    factKey: varchar({ length: 64 }).notNull().unique(),
    issuerCnpj: varchar({ length: 14 })
      .notNull()
      .references(() => screenerIssuers.cnpj, { onDelete: "cascade" }),
    ingestionRunId: uuid()
      .notNull()
      .references(() => screenerIngestionRuns.id),
    documentType: varchar({ length: 8 }).notNull(),
    documentId: text(),
    documentCategory: varchar({ length: 8 }),
    documentReceivedDate: date(),
    metadataMatch: varchar({ length: 12 }).notNull(),
    referenceDate: date().notNull(),
    periodStart: date(),
    periodEnd: date(),
    statement: varchar({ length: 12 }).notNull(),
    accountCode: varchar({ length: 24 }).notNull(),
    accountLabel: text().notNull(),
    candidateKind: varchar({ length: 48 }),
    rawValue: text(),
    currency: varchar({ length: 8 }),
    scale: varchar({ length: 8 }),
    statementGroup: text(),
    exerciseOrder: varchar({ length: 16 }),
    version: varchar({ length: 16 }).notNull(),
    sourceFile: varchar({ length: 256 }).notNull(),
    sourceRow: integer().notNull(),
    archiveFetchedAt: timestamp({ withTimezone: true }).notNull(),
    recordType: varchar({ length: 10 }).notNull(),
    calculatedValue: text(),
    derivationMethod: varchar({ length: 32 }),
    derivationCurrentFactKey: varchar({ length: 64 }),
    derivationPreviousFactKey: varchar({ length: 64 }),
  },
  (table) => [
    index("valuation_accounting_issuer_reference_idx").on(
      table.issuerCnpj,
      table.referenceDate,
    ),
    index("valuation_accounting_received_idx").on(
      table.issuerCnpj,
      table.documentReceivedDate,
    ),
  ],
);

/* v8 ignore stop */
