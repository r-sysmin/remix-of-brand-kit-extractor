import { createHash, timingSafeEqual } from "node:crypto";

export function hashDesignOwnerToken(ownerToken: string): string {
  if (!ownerToken || ownerToken.length > 200) throw new Error("Design history not found");
  return createHash("sha256").update(ownerToken, "utf8").digest("hex");
}

export function assertDesignOwnerHash(stored: string | null, ownerToken: string): void {
  const supplied = hashDesignOwnerToken(ownerToken);
  if (!stored || stored.length !== supplied.length) throw new Error("Design history not found");
  if (!timingSafeEqual(Buffer.from(stored), Buffer.from(supplied))) {
    throw new Error("Design history not found");
  }
}