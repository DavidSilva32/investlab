import { and, eq, lt, sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const authUsers = pgTable(
  "auth_users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    phone: varchar({ length: 11 }),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: varchar({ length: 10 }).notNull().default("USER"),
    accountStatus: varchar({ length: 12 }).notNull().default("ACTIVE"),
    betaActivatedAt: timestamp({ withTimezone: true }),
    betaExpiresAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_users_email_normalized_uidx").on(
      sql`lower(trim(${table.email}))`,
    ),
    check("auth_users_role_check", sql`${table.role} in ('USER', 'ADMIN')`),
    check(
      "auth_users_account_status_check",
      sql`${table.accountStatus} in ('ACTIVE', 'PENDING', 'DISABLED')`,
    ),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    provider: varchar({ length: 16 }).notNull().default("ASAAS"),
    providerSubscriptionId: varchar({ length: 64 }).notNull(),
    status: varchar({ length: 24 }).notNull().default("PENDING"),
    billingType: varchar({ length: 16 }).notNull(),
    amountCents: integer().notNull(),
    nextDueDate: date(),
    accessUntil: timestamp({ withTimezone: true }),
    providerEventAt: timestamp({ withTimezone: true }),
    localCancellationAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_subscriptions_provider_subscription_uidx").on(
      table.provider,
      table.providerSubscriptionId,
    ),
    uniqueIndex("billing_subscriptions_user_pending_uidx")
      .on(table.userId)
      .where(sql`${table.status} in ('PENDING', 'ACTIVE', 'OVERDUE')`),
    check(
      "billing_subscriptions_status_check",
      sql`${table.status} in ('PENDING', 'ACTIVE', 'OVERDUE', 'CANCELED', 'REFUNDED', 'CHARGEBACK')`,
    ),
    check(
      "billing_subscriptions_billing_type_check",
      sql`${table.billingType} in ('CREDIT_CARD', 'PIX', 'BOLETO')`,
    ),
    check("billing_subscriptions_amount_check", sql`${table.amountCents} > 0`),
  ],
);

export const billingCheckouts = pgTable(
  "billing_checkouts",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    externalReference: varchar({ length: 200 }).notNull(),
    providerCheckoutId: varchar({ length: 64 }),
    providerSubscriptionId: varchar({ length: 64 }),
    status: varchar({ length: 24 }).notNull().default("PENDING"),
    billingType: varchar({ length: 16 }).notNull(),
    amountCents: integer().notNull(),
    nextDueDate: date(),
    providerEventAt: timestamp({ withTimezone: true }),
    checkoutUrl: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_checkouts_external_reference_uidx").on(
      table.externalReference,
    ),
    uniqueIndex("billing_checkouts_provider_checkout_uidx").on(
      table.providerCheckoutId,
    ),
    uniqueIndex("billing_checkouts_user_open_uidx")
      .on(table.userId)
      .where(
        sql`${table.status} in ('PENDING', 'PAID', 'SUBSCRIPTION_CREATED')`,
      ),
    check(
      "billing_checkouts_status_check",
      sql`${table.status} in ('PENDING', 'PAID', 'SUBSCRIPTION_CREATED', 'COMPLETED', 'CANCELED', 'EXPIRED')`,
    ),
    check(
      "billing_checkouts_billing_type_check",
      sql`${table.billingType} = 'CREDIT_CARD'`,
    ),
    check("billing_checkouts_amount_check", sql`${table.amountCents} > 0`),
  ],
);

export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    providerEventId: varchar({ length: 128 }).notNull(),
    eventType: varchar({ length: 64 }).notNull(),
    resourceId: varchar({ length: 64 }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    providerCreatedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("billing_webhook_events_provider_event_uidx").on(
      table.providerEventId,
    ),
  ],
);

export const learningCourseProgress = pgTable(
  "learning_course_progress",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    courseId: varchar({ length: 32 }).notNull(),
    courseVersion: integer().notNull(),
    completedLessonIds: jsonb().$type<string[]>().notNull().default([]),
    lastLessonId: varchar({ length: 64 }),
    latestScore: real(),
    bestScore: real(),
    quizAttemptCount: integer().notNull().default(0),
    lastAttemptId: varchar({ length: 64 }),
    passedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_course_progress_user_course_version_uidx").on(
      table.userId,
      table.courseId,
      table.courseVersion,
    ),
    check(
      "learning_course_progress_version_check",
      sql`${table.courseVersion} > 0`,
    ),
    check(
      "learning_course_progress_course_check",
      sql`${table.courseId} in ('fixed_income', 'brazilian_equities', 'international_etfs', 'fiis')`,
    ),
    check(
      "learning_course_progress_latest_score_check",
      sql`${table.latestScore} is null or (${table.latestScore} >= 0 and ${table.latestScore} <= 10)`,
    ),
    check(
      "learning_course_progress_best_score_check",
      sql`${table.bestScore} is null or (${table.bestScore} >= 0 and ${table.bestScore} <= 10)`,
    ),
    check(
      "learning_course_progress_attempt_count_check",
      sql`${table.quizAttemptCount} >= 0`,
    ),
  ],
);

export const learningCourseAttempts = pgTable(
  "learning_course_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    courseId: varchar({ length: 32 }).notNull(),
    courseVersion: integer().notNull(),
    attemptId: uuid().notNull(),
    score: real().notNull(),
    passed: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_course_attempts_owner_course_attempt_uidx").on(
      table.userId,
      table.courseId,
      table.courseVersion,
      table.attemptId,
    ),
    check(
      "learning_course_attempts_version_check",
      sql`${table.courseVersion} > 0`,
    ),
    check(
      "learning_course_attempts_course_check",
      sql`${table.courseId} in ('fixed_income', 'brazilian_equities', 'international_etfs', 'fiis')`,
    ),
    check(
      "learning_course_attempts_score_check",
      sql`${table.score} >= 0 and ${table.score} <= 10`,
    ),
  ],
);
export const imports = pgTable(
  "imports",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    origin: varchar({ length: 40 }).notNull().default("B3"),
    documentType: varchar({ length: 40 }).notNull().default("B3_POSITION_XLSX"),
    fileName: text().notNull(),
    fileHash: varchar({ length: 64 }).notNull(),
    referenceDate: date(),
    estimationBaseDate: date(),
    status: varchar({ length: 20 }).notNull().default("CONFIRMED"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("imports_user_file_hash_uidx").on(table.userId, table.fileHash),
  ],
);

export const authSessions = pgTable("auth_sessions", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
});
export const authAccounts = pgTable("auth_accounts", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const authVerifications = pgTable("auth_verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: text().primaryKey(),
    key: text().notNull().unique(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: "number" }).notNull(),
  },
  (table) => [index("auth_rate_limits_last_request_idx").on(table.lastRequest)],
);
export const authJwks = pgTable("jwks", {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  expiresAt: timestamp({ withTimezone: true }),
  alg: text(),
  crv: text(),
});

export const oauthClients = pgTable("oauthClient", {
  id: text().primaryKey(),
  clientId: text().notNull().unique(),
  clientSecret: text(),
  clientDiscoveryId: text(),
  disabled: boolean().default(false),
  skipConsent: boolean(),
  enableEndSession: boolean(),
  subjectType: text(),
  scopes: text().array(),
  clientCredentialsScopes: text().array().default([]),
  userId: text().references(() => authUsers.id),
  createdAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }),
  name: text(),
  uri: text(),
  icon: text(),
  contacts: text().array(),
  tos: text(),
  policy: text(),
  softwareId: text(),
  softwareVersion: text(),
  softwareStatement: text(),
  redirectUris: text().array().notNull(),
  postLogoutRedirectUris: text().array(),
  backchannelLogoutUri: text(),
  backchannelLogoutSessionRequired: boolean(),
  tokenEndpointAuthMethod: text(),
  applicationType: text(),
  jwks: text(),
  jwksUri: text(),
  grantTypes: text().array(),
  responseTypes: text().array(),
  requirePKCE: boolean(),
  dpopBoundAccessTokens: boolean().default(false),
  referenceId: text(),
  metadata: jsonb(),
});

export const oauthResources = pgTable("oauthResource", {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text().array(),
  customClaims: jsonb(),
  dpopBoundAccessTokensRequired: boolean().default(false),
  disabled: boolean().default(false),
  createdAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }),
  policyVersion: integer().default(1),
  metadata: jsonb(),
});

export const oauthClientResources = pgTable(
  "oauthClientResource",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text()
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb(),
    createdAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("oauthClientResource_client_resource_uidx").on(
      table.clientId,
      table.resourceId,
    ),
  ],
);

export const oauthRefreshTokens = pgTable("oauthRefreshToken", {
  id: text().primaryKey(),
  token: text().notNull().unique(),
  clientId: text()
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: text().references(() => authSessions.id, { onDelete: "set null" }),
  userId: text()
    .notNull()
    .references(() => authUsers.id),
  referenceId: text(),
  authorizationCodeId: text(),
  resources: text().array(),
  requestedUserInfoClaims: text().array(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  revoked: timestamp({ withTimezone: true }),
  rotatedAt: timestamp({ withTimezone: true }),
  rotationReplayResponse: text(),
  rotationReplayExpiresAt: timestamp({ withTimezone: true }),
  authTime: timestamp({ withTimezone: true }),
  confirmation: jsonb(),
  scopes: text().array().notNull(),
});

export const oauthAccessTokens = pgTable("oauthAccessToken", {
  id: text().primaryKey(),
  token: text().unique(),
  clientId: text()
    .notNull()
    .references(() => oauthClients.clientId),
  sessionId: text().references(() => authSessions.id, { onDelete: "set null" }),
  userId: text().references(() => authUsers.id),
  referenceId: text(),
  authorizationCodeId: text(),
  resources: text().array(),
  requestedUserInfoClaims: text().array(),
  refreshId: text().references(() => oauthRefreshTokens.id),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  revoked: timestamp({ withTimezone: true }),
  confirmation: jsonb(),
  scopes: text().array().notNull(),
});

export const oauthConsents = pgTable("oauthConsent", {
  id: text().primaryKey(),
  clientId: text()
    .notNull()
    .references(() => oauthClients.clientId),
  userId: text().references(() => authUsers.id),
  referenceId: text(),
  resources: text().array(),
  requestedUserInfoClaims: text().array(),
  scopes: text().array().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull(),
});

export const oauthClientAssertions = pgTable("oauthClientAssertion", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const authInvitations = pgTable("auth_invitations", {
  id: uuid().defaultRandom().primaryKey(),
  email: text().notNull(),
  tokenHash: varchar({ length: 64 }).notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdByUserId: text()
    .notNull()
    .references(() => authUsers.id),
});
export const authTermsAcceptances = pgTable(
  "auth_terms_acceptances",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id),
    termsVersion: varchar({ length: 40 }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auth_terms_acceptances_user_accepted_idx").on(
      table.userId,
      table.acceptedAt,
    ),
  ],
);
export const authPasswordResets = pgTable("auth_password_resets", {
  id: uuid().defaultRandom().primaryKey(),
  userId: text()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar({ length: 64 }).notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdByUserId: text()
    .notNull()
    .references(() => authUsers.id),
});
export const positionSnapshots = pgTable("position_snapshots", {
  userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
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
  userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
  id: uuid().defaultRandom().primaryKey(),
  snapshotId: uuid()
    .notNull()
    .references(() => positionSnapshots.id),
  sourceSheet: text().notNull().default(""),
  sourceRow: integer().notNull().default(0),
  instrumentKind: varchar({ length: 24 }).notNull().default("UNKNOWN"),
  product: text().notNull(),
  institution: text(),
  account: text(),
  issuer: text(),
  issuerCnpj: text(),
  sourceType: text(),
  assetCode: text(),
  originalAssetCode: text(),
  isin: text(),
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
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
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

export const manualPortfolioPositions = pgTable(
  "manual_portfolio_positions",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    assetKey: varchar({ length: 64 }).notNull(),
    product: text().notNull(),
    assetCode: varchar({ length: 24 }),
    institution: text(),
    quantity: numeric({ precision: 24, scale: 8 }).notNull(),
    currency: varchar({ length: 3 }).notNull(),
    unitPrice: numeric({ precision: 24, scale: 8 }),
    totalValue: numeric({ precision: 24, scale: 8 }).notNull(),
    valueBasis: varchar({ length: 16 }).notNull(),
    informationalCdiPercentage: numeric({ precision: 8, scale: 4 }),
    positionDate: date().notNull(),
    convertedValueBrl: numeric({ precision: 24, scale: 8 }),
    conversionDate: date(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("manual_portfolio_positions_user_asset_uidx").on(
      table.userId,
      table.assetKey,
    ),
  ],
);
export const manualPortfolioPositionSnapshots = pgTable(
  "manual_portfolio_position_snapshots",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    assetKey: varchar({ length: 64 }).notNull(),
    product: text().notNull(),
    assetCode: varchar({ length: 24 }),
    currency: varchar({ length: 3 }).notNull(),
    totalValue: numeric({ precision: 24, scale: 8 }),
    convertedValueBrl: numeric({ precision: 24, scale: 8 }),
    positionDate: date().notNull(),
    conversionDate: date(),
    valueBasis: varchar({ length: 16 }).notNull(),
    status: varchar({ length: 16 }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex(
      "manual_portfolio_position_snapshots_user_asset_recorded_uidx",
    ).on(table.userId, table.assetKey, table.recordedAt),
  ],
);
export const manualPortfolioAdjustmentEvents = pgTable(
  "manual_portfolio_adjustment_events",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    assetKey: varchar({ length: 64 }).notNull(),
    eventType: varchar({ length: 32 })
      .$type<"NEUTRAL_ADJUSTMENT">()
      .notNull()
      .default("NEUTRAL_ADJUSTMENT"),
    previousQuantity: numeric({ precision: 24, scale: 8 }).notNull(),
    quantity: numeric({ precision: 24, scale: 8 }).notNull(),
    previousUnitPrice: numeric({ precision: 24, scale: 8 }),
    unitPrice: numeric({ precision: 24, scale: 8 }),
    previousTotalValue: numeric({ precision: 24, scale: 8 }).notNull(),
    totalValue: numeric({ precision: 24, scale: 8 }).notNull(),
    previousCurrency: varchar({ length: 3 }).notNull(),
    currency: varchar({ length: 3 }).notNull(),
    previousValueBasis: varchar({ length: 16 }).notNull(),
    valueBasis: varchar({ length: 16 }).notNull(),
    previousPositionDate: date().notNull(),
    positionDate: date().notNull(),
    previousConvertedValueBrl: numeric({ precision: 24, scale: 8 }),
    convertedValueBrl: numeric({ precision: 24, scale: 8 }),
    previousConversionDate: date(),
    conversionDate: date(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    requestId: text(),
  },
  (table) => [
    index("manual_portfolio_adjustment_events_asset_recorded_idx").on(
      table.assetKey,
      table.recordedAt,
    ),
    check(
      "manual_portfolio_adjustment_events_type_check",
      sql`${table.eventType} = 'NEUTRAL_ADJUSTMENT'`,
    ),
  ],
);
export const positionReconciliationEvents = pgTable(
  "position_reconciliation_events",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    manualAssetKey: varchar({ length: 64 }).notNull(),
    importedAssetKey: varchar({ length: 67 }).notNull(),
    status: varchar({ length: 16 })
      .$type<"LINK" | "UNLINK" | "SEPARATE">()
      .notNull(),
    effectiveFrom: date().notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    requestId: text().notNull(),
    importId: uuid(),
  },
  (table) => [
    index("position_reconciliation_manual_recorded_idx").on(
      table.manualAssetKey,
      table.recordedAt,
    ),
    check(
      "position_reconciliation_status_check",
      sql`${table.status} IN ('LINK', 'UNLINK', 'SEPARATE')`,
    ),
  ],
);

export const cdbRateConfigurations = pgTable(
  "cdb_rate_configurations",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    assetCode: text().notNull(),
    cdiPercentage: numeric({ precision: 9, scale: 4 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cdb_rate_configurations_user_asset_uidx").on(
      table.userId,
      table.assetCode,
    ),
  ],
);
export const emergencyReserveSettings = pgTable(
  "emergency_reserve_settings",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: text().primaryKey(),
    monthlyExpenses: numeric({ precision: 18, scale: 2 }),
    targetMonths: integer(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("emergency_reserve_settings_user_id_uidx").on(
      table.userId,
      table.id,
    ),
  ],
);
/* v8 ignore start -- Drizzle table declarations are declarative schema metadata. */
export const portfolioObjectives = pgTable(
  "portfolio_objectives",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
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
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    objectiveId: uuid()
      .notNull()
      .references(() => portfolioObjectives.id, { onDelete: "cascade" }),
    assetKey: varchar({ length: 80 }).notNull(),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("portfolio_objective_positions_user_asset_uidx").on(
      table.userId,
      table.assetKey,
    ),
    index("portfolio_objective_positions_objective_idx").on(table.objectiveId),
  ],
);
/* v8 ignore stop */
/* v8 ignore start -- Drizzle table declarations are declarative schema metadata. */
export const portfolioObjectiveReferenceBatches = pgTable(
  "portfolio_objective_reference_batches",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    observedOn: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
);
export const portfolioObjectiveBalanceReferences = pgTable(
  "portfolio_objective_balance_references",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
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
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: text().primaryKey(),
    percentages: jsonb().$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("portfolio_allocation_targets_user_id_uidx").on(
      table.userId,
      table.id,
    ),
  ],
);
export const personalInvestmentStrategy = pgTable(
  "personal_investment_strategy",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: text().primaryKey(),
    answers: jsonb().$type<{
      horizonYears: number;
      internationalInterest: "interested" | "not_interested" | "unsure";
    }>(),
    selectedDirection: varchar({ length: 40 }),
    allocationPercentages: jsonb().$type<Record<string, number> | null>(),
    allocationActive: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("personal_investment_strategy_user_id_uidx").on(
      table.userId,
      table.id,
    ),
  ],
);
export const cdiDailyRates = pgTable("cdi_daily_rates", {
  rateDate: date().primaryKey(),
  annualRate: numeric({ precision: 9, scale: 6 }).notNull(),
  fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const movementItems = pgTable(
  "movement_items",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    importId: uuid()
      .notNull()
      .references(() => imports.id),
    sourceRow: integer().notNull().default(0),
    eventFingerprint: varchar({ length: 32 }).notNull(),
    direction: varchar({ length: 10 }).notNull(),
    occurredAt: date().notNull(),
    movementType: text().notNull(),
    product: text().notNull(),
    assetCode: text(),
    originalAssetCode: text(),
    institution: text(),
    quantity: numeric({ precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric({ precision: 24, scale: 8 }),
    operationValue: numeric({ precision: 24, scale: 8 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("movement_items_user_event_fingerprint_idx").on(
      table.userId,
      table.eventFingerprint,
    ),
  ],
);
export const tradingItems = pgTable(
  "trading_items",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    importId: uuid()
      .notNull()
      .references(() => imports.id),
    sourceRow: integer().notNull(),
    identityFingerprint: varchar({ length: 64 }).notNull(),
    side: varchar({ length: 4 }).$type<"BUY" | "SELL">().notNull(),
    tradingDate: date().notNull(),
    settlementDate: date(),
    movementType: text().notNull(),
    market: text(),
    product: text().notNull(),
    assetCode: text(),
    originalAssetCode: text(),
    institution: text(),
    quantity: numeric({ precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric({ precision: 24, scale: 8 }),
    grossValue: numeric({ precision: 24, scale: 8 }),
    fees: numeric({ precision: 24, scale: 8 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("trading_items_import_source_row_uidx").on(
      table.importId,
      table.sourceRow,
    ),
    index("trading_items_user_identity_idx").on(
      table.userId,
      table.identityFingerprint,
    ),
  ],
);
export const b3ReconciliationEvents = pgTable(
  "b3_reconciliation_events",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    eventOrder: bigserial({ mode: "number" }).notNull(),
    tradingItemId: uuid()
      .notNull()
      .references(() => tradingItems.id, { onDelete: "restrict" }),
    movementItemId: uuid()
      .notNull()
      .references(() => movementItems.id, { onDelete: "restrict" }),
    status: varchar({ length: 16 }).$type<"LINK" | "KEEP_SEPARATE">().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("b3_reconciliation_event_order_uidx").on(table.eventOrder),
    index("b3_reconciliation_pair_history_idx").on(
      table.userId,
      table.tradingItemId,
      table.movementItemId,
      table.eventOrder,
    ),
  ],
);
export const manualPortfolioOperations = pgTable(
  "manual_portfolio_operations",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    idempotencyKey: uuid().notNull().defaultRandom(),
    side: varchar({ length: 8 }).$type<"BUY" | "SELL">().notNull(),
    effectiveDate: date().notNull(),
    product: text().notNull(),
    assetCode: text(),
    quantity: numeric({ precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric({ precision: 24, scale: 8 }).notNull(),
    currency: varchar({ length: 3 }).notNull(),
    fees: numeric({ precision: 24, scale: 8 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("manual_portfolio_operations_idempotency_key_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
    check(
      "manual_portfolio_operations_side_check",
      sql`${table.side} IN ('BUY', 'SELL')`,
    ),
    check(
      "manual_portfolio_operations_quantity_check",
      sql`${table.quantity} > 0`,
    ),
    check(
      "manual_portfolio_operations_unit_price_check",
      sql`${table.unitPrice} >= 0`,
    ),
    check(
      "manual_portfolio_operations_fees_check",
      sql`${table.fees} IS NULL OR ${table.fees} >= 0`,
    ),
    index("manual_portfolio_operations_effective_date_idx").on(
      table.effectiveDate,
      table.createdAt,
    ),
  ],
);
export const portfolioOperationReconciliationEvents = pgTable(
  "portfolio_operation_reconciliation_events",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    eventOrder: bigserial({ mode: "number" }).notNull(),
    operationId: uuid()
      .notNull()
      .references(() => manualPortfolioOperations.id, { onDelete: "restrict" }),
    movementId: uuid()
      .notNull()
      .references(() => movementItems.id, { onDelete: "restrict" }),
    status: varchar({ length: 8 }).$type<"LINK" | "UNLINK">().notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    requestId: text().notNull(),
  },
  (table) => [
    uniqueIndex("portfolio_operation_reconciliation_event_order_unique").on(
      table.eventOrder,
    ),
    index("portfolio_operation_reconciliation_operation_recorded_idx").on(
      table.operationId,
      table.recordedAt,
    ),
    index("portfolio_operation_reconciliation_movement_recorded_idx").on(
      table.movementId,
      table.recordedAt,
    ),
    check(
      "portfolio_operation_reconciliation_status_check",
      sql`${table.status} IN ('LINK', 'UNLINK')`,
    ),
  ],
);

export const stockFundamentals = pgTable("stock_fundamentals", {
  id: uuid().defaultRandom().primaryKey(),
  ticker: varchar({ length: 16 }).notNull(),
  cnpj: varchar({ length: 14 }).notNull(),
  periodType: varchar({ length: 12 }).notNull(),
  referenceDate: date().notNull(),
  periodStart: date(),
  periodEnd: date(),
  filingReferenceDate: date(),
  exerciseOrder: varchar({ length: 12 }),
  periodBasis: varchar({ length: 32 }).notNull().default("unknown"),
  revenueVersion: varchar({ length: 32 }),
  revenueAccountLabel: varchar({ length: 256 }),
  netIncomeVersion: varchar({ length: 32 }),
  netIncomeAccount: varchar({ length: 16 }),
  netIncomeConcept: varchar({ length: 64 }),
  parentNetIncomeVersion: varchar({ length: 32 }),
  parentNetIncomeAccount: varchar({ length: 16 }),
  parentNetIncomeConcept: varchar({ length: 64 }),
  nonControllingNetIncomeVersion: varchar({ length: 32 }),
  nonControllingNetIncomeAccount: varchar({ length: 16 }),
  nonControllingNetIncomeConcept: varchar({ length: 64 }),
  equityVersion: varchar({ length: 32 }),
  equityAccount: varchar({ length: 16 }),
  equityConcept: varchar({ length: 64 }),
  nonControllingEquityVersion: varchar({ length: 32 }),
  nonControllingEquityAccount: varchar({ length: 16 }),
  nonControllingEquityConcept: varchar({ length: 64 }),
  revenue: numeric({ precision: 24, scale: 2 }),
  netIncome: numeric({ precision: 24, scale: 2 }),
  parentNetIncome: numeric({ precision: 24, scale: 2 }),
  nonControllingNetIncome: numeric({ precision: 24, scale: 2 }),
  equity: numeric({ precision: 24, scale: 2 }),
  nonControllingEquity: numeric({ precision: 24, scale: 2 }),
  assets: numeric({ precision: 24, scale: 2 }),
  liabilities: numeric({ precision: 24, scale: 2 }),
  cash: numeric({ precision: 24, scale: 2 }),
  debt: numeric({ precision: 24, scale: 2 }),
  sourceDocument: varchar({ length: 8 }).notNull(),
  sourceVersion: varchar({ length: 32 }).notNull(),
  fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const stockFundamentalRefreshes = pgTable(
  "stock_fundamental_refreshes",
  {
    ticker: varchar({ length: 16 }).notNull(),
    cnpj: varchar({ length: 14 }).notNull(),
    sourceVersion: varchar({ length: 32 }).notNull(),
    status: varchar({ length: 12 }).notNull(),
    leaseToken: uuid().notNull(),
    attemptCount: integer().notNull().default(1),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    retryAfter: timestamp({ withTimezone: true }),
    errorCode: varchar({ length: 64 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_fundamental_refresh_identity_idx").on(
      table.ticker,
      table.cnpj,
      table.sourceVersion,
    ),
    index("stock_fundamental_refresh_status_idx").on(table.status),
    check(
      "stock_fundamental_refresh_status_check",
      sql`${table.status} IN ('RUNNING', 'COMPLETED', 'FAILED')`,
    ),
  ],
);

export const stockOpportunityManualInputs = pgTable(
  "stock_opportunity_manual_inputs",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    ticker: varchar({ length: 16 }).notNull(),
    inputKey: varchar({ length: 24 }).notNull(),
    value: numeric({ precision: 24, scale: 8 }).notNull(),
    source: text().notNull(),
    asOf: date().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_opportunity_manual_user_ticker_input_idx").on(
      table.userId,
      table.ticker,
      table.inputKey,
    ),
    index("stock_opportunity_manual_ticker_idx").on(table.ticker),
  ],
);

export const stockOpportunityAnalysisSettings = pgTable(
  "stock_opportunity_analysis_settings",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: text().primaryKey(),
    bazinTargetYield: numeric({ precision: 8, scale: 4 })
      .notNull()
      .default("6"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_opportunity_analysis_settings_user_id_uidx").on(
      table.userId,
      table.id,
    ),
  ],
);
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

export const portfolioAssetClassifications = pgTable(
  "portfolio_asset_classifications",
  {
    userId: text().references(() => authUsers.id, { onDelete: "cascade" }),
    id: uuid().defaultRandom().primaryKey(),
    assetKey: varchar({ length: 64 }).notNull(),
    assetClass: varchar({ length: 80 }),
    subClass: varchar({ length: 120 }),
    geography: varchar({ length: 40 }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("portfolio_asset_classifications_user_asset_uidx").on(
      table.userId,
      table.assetKey,
    ),
  ],
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
