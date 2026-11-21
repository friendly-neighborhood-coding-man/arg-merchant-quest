import { Connection } from "@solana/web3.js";

export const RPC = process.env.ARG_SOLANA_RPC_URL ?? "https://rpc.magicblock.app/devnet";

export function baseConnection() {
  return new Connection(RPC, "confirmed");
}
