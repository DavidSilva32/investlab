import { and, eq, lt, sql } from "drizzle-orm";
import {
  boolean,
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
  selectedAssetKeys: jsonb().$type<string[]>().notNull().default([]),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
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
  quantitativeEligible: boolean().notNull().default(false),
  eligibilityReason: varchar({ length: 80 }),
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
