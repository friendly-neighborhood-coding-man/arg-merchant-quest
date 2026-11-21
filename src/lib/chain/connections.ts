import { Connection } from "@solana/web3.js";
import { BASE_RPC_URL, ER_RPC_URL, MAGIC_ROUTER_URL } from "./config";

/**
 * Two connections, on purpose:
 * - the base layer confirms delegation, the SPL transfer and the committed counter;
 * - the Ephemeral Rollup runs the counter update itself.
 */
let base: Connection | null = null;
let ephemeral: Connection | null = null;

export function baseConnection(): Connection {
  if (!base) base = new Connection(BASE_RPC_URL, "confirmed");
  return base;
}

export function ephemeralConnection(endpoint: string = ER_RPC_URL): Connection {
  if (!ephemeral || endpoint !== ER_RPC_URL) {
    const connection = new Connection(endpoint, "confirmed");
    if (endpoint === ER_RPC_URL) ephemeral = connection;
    return connection;
  }
  return ephemeral;
}

export interface DelegationStatus {
  isDelegated: boolean;
  fqdn: string | null;
  owner: string | null;
}

/**
 * Magic Router answers where a delegated account currently lives. The ER
 * endpoint from the router is used for the counter update instead of assuming
 * the configured region is the one that received the delegation.
 */
export async function getDelegationStatus(address: string): Promise<DelegationStatus> {
  try {
    const response = await fetch(MAGIC_ROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [address],
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      result?: {
        isDelegated?: boolean;
        fqdn?: string;
        delegationRecord?: { owner?: string };
      };
    };
    return {
      isDelegated: Boolean(body.result?.isDelegated),
      fqdn: body.result?.fqdn ?? null,
      owner: body.result?.delegationRecord?.owner ?? null,
    };
  } catch {
    return { isDelegated: false, fqdn: null, owner: null };
  }
}
