import "server-only";
import { db } from "@/modules/core/db";

/** Idempotencia del webhook: cada update_id se procesa una sola vez. */
export type UpdateClaim =
  | { claimed: true; token: string }
  | { claimed: false; duplicate: boolean; inProgress: boolean };

export async function claimUpdate(updateId: number): Promise<UpdateClaim> {
  const { data, error } = await db().rpc("claim_telegram_update", { p_update_id: updateId, p_lease_seconds: 120 });
  if (error) throw new Error(`claim_update_failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { acquired: boolean; already_processed: boolean; in_progress: boolean; lease_token: string | null } | undefined;
  if (!row) throw new Error("claim_update_empty");
  if (row.acquired && row.lease_token) return { claimed: true, token: row.lease_token };
  return { claimed: false, duplicate: row.already_processed, inProgress: row.in_progress };
}

export async function completeUpdate(updateId: number, token: string) {
  const { error } = await db().rpc("complete_telegram_update", { p_update_id: updateId, p_lease_token: token });
  if (error) throw new Error(`complete_update_failed: ${error.message}`);
}

export async function releaseUpdate(updateId: number, token: string) {
  const { error } = await db().rpc("release_telegram_update", { p_update_id: updateId, p_lease_token: token });
  if (error) console.error("release_update_failed", error.message);
}
