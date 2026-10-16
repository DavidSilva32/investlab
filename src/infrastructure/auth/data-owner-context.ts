import { AsyncLocalStorage } from "node:async_hooks";

const ownerContext = new AsyncLocalStorage<string>();

export function runWithDataOwner<T>(userId: string, operation: () => T): T {
  if (!userId) throw new Error("A data owner is required for this operation.");
  return ownerContext.run(userId, operation);
}

export function getDataOwnerId(): string | null {
  return ownerContext.getStore() ?? null;
}

export function requireDataOwnerId(): string {
  const userId = getDataOwnerId();
  if (!userId) throw new Error("A data owner is required for this operation.");
  return userId;
}
