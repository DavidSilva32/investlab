import {
  date,
  numeric,
  pgTable,
  text,
  timestamp,
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
