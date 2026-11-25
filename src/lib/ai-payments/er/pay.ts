/**
 * Execution of the native MagicBlock payment for one quote.
 *
 * The payment is a real transfer of the campaign's existing visit token inside a
 * MagicBlock Ephemeral Rollup: the payer's balance is first deposited into the
 * mint's Global Vault and delegated (base layer), then the transfer itself runs
 * on the rollup (`sendTo: "ephemeral"`). Only the second leg is the payment.
 *
 * The payer here is the isolated demo rollup wallet the operator provisioned for
 * the authorized Devnet proof. It is the only signer this module ever holds, and
 * only when `ARG_AI_DEMO_PAYER_KEY` points at a local keypair file. Players with
 * their own wallet keep the ordinary Solana Pay fallback until a wallet adapter
 * is added; nothing here accepts a client-reported success.
 */

import fs from "node:fs";
import { Keypair } from "@solana/web3.js";
import { CLUSTER } from "../../chain/config";
import type { AiPaymentsConfig } from "../config";
import {
  buildDeposit,
  buildErTransfer,
  erConfig,
  erOwnerBalance,
  fetchErFacts,
  mintState,
  ownerBalance,
  signBuilt,
  submitAndConfirm,
  type BuiltTransaction,
} from "./client";
import { erMemo, verifyErTransfer, type ErFacts } from "./verify";

export interface NativeDeps {
  mintState?: typeof mintState;
  ownerBalance?: typeof ownerBalance;
  buildDeposit?: typeof buildDeposit;
  buildErTransfer?: typeof buildErTransfer;
  submitAndConfirm?: typeof submitAndConfirm;
  fetchErFacts?: (signature: string) => Promise<ErFacts | null>;
  erOwnerBalance?: typeof erOwnerBalance;
  payer?: Keypair | null;
}

/** Load the isolated demo rollup wallet, if this deployment has one. */
export function demoPayer(env: NodeJS.ProcessEnv = process.env): Keypair | null {
  const file = (env.ARG_AI_DEMO_PAYER_KEY ?? "").trim();
  if (!file || CLUSTER !== "devnet") return null;
  try {
    const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
    if (!Array.isArray(secret) || secret.length !== 64) return null;
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch {
    return null;
  }
}

export interface NativePaymentEvidence {
  payer: string;
  validator: string;
  erEndpoint: string;
  memo: string;
  amountBaseUnits: number;
  deposit: { signature: string; confirmation: "base-confirmed"; amountBaseUnits: number } | null;
  receiverSetup: { signature: string; confirmation: "base-confirmed" } | null;
  transfer: {
    signature: string;
    confirmation: "er-confirmed";
    feeLamports: number | null;
    instructionCount: number;
  };
  payerBalanceBefore: number | null;
  payerBalanceAfter: number | null;
  receiverBalanceBefore: number | null;
  receiverBalanceAfter: number | null;
  /** ER confirmation is not L1 commitment; this is what we can honestly claim. */
  settlement: "er-confirmed-not-l1";
}

export type PrepareResult =
  | { ok: true; evidence: NativePaymentEvidence }
  | {
      ok: false;
      code:
        | "no_demo_payer"
        | "needs_mint_init"
        | "mint_mismatch"
        | "build_failed"
        | "unconfirmed"
        | "receiver_not_delegated"
        | "verification_failed";
      reason: string;
    };

async function waitForDelegation(
  read: () => Promise<{ delegated: boolean }>,
  attempts = 30,
): Promise<boolean> {
  for (let step = 0; step < attempts; step += 1) {
    const state = await read();
    if (state.delegated) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Run the deposit (only if the payer's rollup balance does not exist yet) and
 * the rollup transfer for one quote, then verify the rollup transaction against
 * that quote before reporting it.
 */
export async function prepareNativePayment(
  intent: {
    id: string;
    mint: string;
    receiver: string;
    receiverAta: string;
    amountBaseUnits: number;
  },
  config: AiPaymentsConfig,
  deps: NativeDeps = {},
): Promise<PrepareResult> {
  const payer = deps.payer === undefined ? demoPayer() : deps.payer;
  if (!payer) {
    return {
      ok: false,
      code: "no_demo_payer",
      reason:
        "This deployment has no rollup demo wallet configured, so the native rollup payment cannot be signed here.",
    };
  }
  if (intent.mint !== config.mint) {
    return { ok: false, code: "mint_mismatch", reason: "That quote is not for the configured visit token." };
  }

  const settings = erConfig();
  const readMintState = deps.mintState ?? mintState;
  const readBalance = deps.ownerBalance ?? ownerBalance;
  const deposit = deps.buildDeposit ?? buildDeposit;
  const transfer = deps.buildErTransfer ?? buildErTransfer;
  const send = deps.submitAndConfirm ?? submitAndConfirm;
  const readFacts = deps.fetchErFacts ?? ((signature: string) => fetchErFacts(signature));
  const readErBalance = deps.erOwnerBalance ?? erOwnerBalance;

  const mint = await readMintState(intent.mint);
  if (!mint.initialized) {
    return {
      ok: false,
      code: "needs_mint_init",
      reason:
        "The visit token has no MagicBlock transfer queue on this validator yet. Initializing it is an operator write and has not been approved here.",
    };
  }

  const payerAddress = payer.publicKey.toBase58();
  const payerBefore = await readBalance(payerAddress, intent.mint);
  const receiverBefore = await readBalance(intent.receiver, intent.mint);

  let depositEvidence: NativePaymentEvidence["deposit"] = null;
  if (!payerBefore.delegated) {
    let built: BuiltTransaction;
    try {
      built = await deposit({
        owner: payerAddress,
        mint: intent.mint,
        amountBaseUnits: intent.amountBaseUnits,
      });
    } catch (error) {
      return { ok: false, code: "build_failed", reason: (error as Error).message };
    }
    try {
      const sent = await send(settings.baseRpc, signBuilt(built, payer), "base-confirmed");
      depositEvidence = {
        signature: sent.signature,
        confirmation: "base-confirmed",
        amountBaseUnits: intent.amountBaseUnits,
      };
    } catch (error) {
      return { ok: false, code: "unconfirmed", reason: (error as Error).message };
    }
    const delegated = await waitForDelegation(() => readBalance(payerAddress, intent.mint));
    if (!delegated) {
      return {
        ok: false,
        code: "unconfirmed",
        reason:
          "The deposit confirmed on the base layer but the rollup did not report the delegated balance in time.",
      };
    }
  }

  // The recipient needs a delegated balance on the same validator to be credited,
  // and only its owner can sign that deposit. This wallet can do it only when the
  // recipient is itself; otherwise the merchant must set it up first.
  let receiverSetup: NativePaymentEvidence["receiverSetup"] = null;
  if (!receiverBefore.delegated) {
    if (intent.receiver !== payerAddress) {
      return {
        ok: false,
        code: "receiver_not_delegated",
        reason:
          "The recipient has no rollup balance on this validator yet. Only its owner can sign that setup deposit, so it has to be done before a player can pay.",
      };
    }
    try {
      const built = await deposit({
        owner: intent.receiver,
        mint: intent.mint,
        amountBaseUnits: 1,
      });
      const sent = await send(settings.baseRpc, signBuilt(built, payer), "base-confirmed");
      receiverSetup = { signature: sent.signature, confirmation: "base-confirmed" };
      await waitForDelegation(() => readBalance(intent.receiver, intent.mint));
    } catch (error) {
      return { ok: false, code: "unconfirmed", reason: (error as Error).message };
    }
  }

  let built: BuiltTransaction;
  try {
    built = await transfer({
      from: payerAddress,
      to: intent.receiver,
      mint: intent.mint,
      amountBaseUnits: intent.amountBaseUnits,
      memo: erMemo(intent.id),
    });
  } catch (error) {
    return { ok: false, code: "build_failed", reason: (error as Error).message };
  }

  let sent: { signature: string; confirmation: "base-confirmed" | "er-confirmed" };
  try {
    sent = await send(settings.erRpc, signBuilt(built, payer), "er-confirmed");
  } catch (error) {
    return { ok: false, code: "unconfirmed", reason: (error as Error).message };
  }

  const facts = await readFacts(sent.signature);
  if (!facts) {
    return {
      ok: false,
      code: "verification_failed",
      reason: "The rollup did not return that transaction, so it cannot be counted as paid.",
    };
  }
  const verified = verifyErTransfer(facts, {
    intentId: intent.id,
    mint: intent.mint,
    destination: intent.receiverAta,
    amountBaseUnits: intent.amountBaseUnits,
    payer: payerAddress,
  });
  if (!verified.ok) {
    return { ok: false, code: "verification_failed", reason: verified.reason };
  }

  const payerAfter = await readBalance(payerAddress, intent.mint);
  const receiverAfterBalance = await readErBalance(intent.receiver, intent.mint);
  const fee = built.fees ? Number(built.fees.lamports) : null;

  return {
    ok: true,
    evidence: {
      payer: payerAddress,
      validator: built.validator ?? settings.validator,
      erEndpoint: settings.erRpc,
      memo: erMemo(intent.id),
      amountBaseUnits: verified.amountBaseUnits,
      deposit: depositEvidence,
      receiverSetup,
      transfer: {
        signature: sent.signature,
        confirmation: "er-confirmed",
        feeLamports: Number.isFinite(fee) ? fee : null,
        instructionCount: built.instructionCount,
      },
      payerBalanceBefore: payerBefore.baseBalance,
      payerBalanceAfter: payerAfter.baseBalance,
      receiverBalanceBefore: receiverBefore.baseBalance,
      receiverBalanceAfter: receiverAfterBalance,
      settlement: "er-confirmed-not-l1",
    },
  };
}
