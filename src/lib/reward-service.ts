import { PublicKey } from "@solana/web3.js";
import { REWARD_BASE_UNITS, rewardMintConfig } from "./chain/config";
import { readCounterState, recordVerifiedCompletion } from "./chain/counter";
import { readTokenBalance, rewardDisplay, sendReward } from "./chain/reward";
import { getCampaignById } from "./store";
import {
  beginPayout,
  completePayout,
  failPayout,
  getCompletionById,
  getCompletion,
  saveChainEvidence,
  setCampaignCounterAccount,
  type Completion,
} from "./quest-store";

/**
 * P0.3 orchestration: one verified completion updates the MagicBlock
 * completion counter, and one claim pays the fixed test-token reward on Devnet.
 */

export async function verifyCompletionOnChain(completionId: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const completion = getCompletionById(completionId);
  if (!completion) return { ok: false, error: "Completion not found." };
  if (completion.chainCommittedValue !== null && completion.chainCommitSignature) {
    return { ok: true, error: null };
  }
  const campaign = getCampaignById(completion.campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };

  try {
    const evidence = await recordVerifiedCompletion(completion.campaignId);
    const committed = Boolean(evidence.commitSignature) && evidence.committedValue !== null;
    saveChainEvidence(completionId, {
      status: committed ? "committed" : evidence.commitSignature ? "incrementing" : "failed",
      counterAccount: evidence.counterAccount,
      programId: evidence.programId,
      createSignature: evidence.createSignature,
      delegateSignature: evidence.delegateSignature,
      incrementSignature: evidence.incrementSignature || null,
      commitSignature: evidence.commitSignature,
      counterValue: evidence.counterValue,
      committedValue: evidence.committedValue,
      erEndpoint: evidence.erEndpoint,
      error: evidence.error,
    });
    setCampaignCounterAccount(completion.campaignId, evidence.counterAccount);
    return { ok: committed, error: evidence.error };
  } catch (error) {
    const message = (error as Error).message;
    saveChainEvidence(completionId, {
      status: "failed",
      counterAccount: "",
      programId: "",
      createSignature: null,
      delegateSignature: null,
      incrementSignature: null,
      commitSignature: null,
      counterValue: null,
      committedValue: null,
      erEndpoint: "",
      error: message,
    });
    return { ok: false, error: message };
  }
}

export function parseWallet(input: string): PublicKey | null {
  try {
    const value = new PublicKey(input.trim());
    return value;
  } catch {
    return null;
  }
}

export interface RewardView {
  display: Awaited<ReturnType<typeof rewardDisplay>>;
  payout: Completion["payoutStatus"] extends string
    ? {
        status: string;
        wallet: string | null;
        mint: string | null;
        amountBaseUnits: number | null;
        signature: string | null;
        error: string | null;
        recipientBefore: number | null;
        recipientAfter: number | null;
        recipientTokenAccount: string | null;
        claimedAt: string | null;
        confirmedAt: string | null;
      }
    : never;
  chain: {
    status: string | null;
    counterAccount: string | null;
    programId: string | null;
    createSignature: string | null;
    delegateSignature: string | null;
    incrementSignature: string | null;
    commitSignature: string | null;
    counterValue: number | null;
    committedValue: number | null;
    erEndpoint: string | null;
    error: string | null;
  };
  liveChain: Awaited<ReturnType<typeof readCounterState>> | null;
  recipientBalance: Awaited<ReturnType<typeof readTokenBalance>> | null;
}

export async function rewardStateForCompletion(
  completion: Completion,
  wallet?: string | null,
): Promise<RewardView> {
  const display = await rewardDisplay();
  let liveChain = null;
  try {
    liveChain = await readCounterState(completion.campaignId);
  } catch {
    liveChain = null;
  }

  let recipientBalance = null;
  const owner = wallet ?? completion.payoutWallet;
  if (owner) {
    try {
      const parsed = parseWallet(owner);
      if (parsed) recipientBalance = await readTokenBalance(parsed, rewardMintConfig().mint);
    } catch {
      recipientBalance = null;
    }
  }

  return {
    display,
    payout: {
      status: completion.payoutStatus,
      wallet: completion.payoutWallet,
      mint: completion.payoutMint,
      amountBaseUnits: completion.payoutAmountBaseUnits,
      signature: completion.payoutSignature,
      error: completion.payoutError,
      recipientBefore: completion.payoutRecipientBefore,
      recipientAfter: completion.payoutRecipientAfter,
      recipientTokenAccount: completion.payoutRecipientTokenAccount,
      claimedAt: completion.payoutClaimedAt,
      confirmedAt: completion.payoutConfirmedAt,
    },
    chain: {
      status: completion.chainStatus,
      counterAccount: completion.chainCounterAccount,
      programId: completion.chainProgramId,
      createSignature: completion.chainCreateSignature,
      delegateSignature: completion.chainDelegateSignature,
      incrementSignature: completion.chainIncrementSignature,
      commitSignature: completion.chainCommitSignature,
      counterValue: completion.chainCounterValue,
      committedValue: completion.chainCommittedValue,
      erEndpoint: completion.chainErEndpoint,
      error: completion.chainError,
    },
    liveChain,
    recipientBalance,
  };
}

export async function claimReward(
  completion: Completion,
  walletInput: string,
): Promise<
  | { ok: true; completion: Completion }
  | { ok: false; status: number; error: string }
> {
  const wallet = parseWallet(walletInput);
  if (!wallet) {
    return {
      ok: false,
      status: 400,
      error: "That does not look like a Solana wallet address. Paste the Devnet wallet you want to receive the test tokens.",
    };
  }

  if (completion.payoutStatus === "paid") {
    return { ok: true, completion };
  }
  if (completion.payoutStatus === "processing") {
    return {
      ok: false,
      status: 409,
      error: "A payout for this completion is already being submitted. Refresh in a moment.",
    };
  }

  let display;
  try {
    display = await rewardDisplay();
  } catch (error) {
    return { ok: false, status: 503, error: (error as Error).message };
  }
  if (!display) {
    return {
      ok: false,
      status: 503,
      error:
        'The reward token is not configured on this deployment. Run "npm run chain:setup" or set ARG_REWARD_MINT.',
    };
  }

  beginPayout(completion.id, wallet.toBase58(), display.mint, REWARD_BASE_UNITS);

  try {
    const receipt = await sendReward(wallet);
    completePayout(completion.id, {
      signature: receipt.signature,
      mint: receipt.mint,
      amountBaseUnits: receipt.amountBaseUnits,
      recipient: receipt.recipient,
      recipientTokenAccount: receipt.recipientTokenAccount,
      recipientBeforeBaseUnits: receipt.recipientBeforeBaseUnits,
      recipientAfterBaseUnits: receipt.recipientAfterBaseUnits,
    });
    const updated = getCompletionById(completion.id);
    if (!updated) return { ok: false, status: 500, error: "The payout could not be recorded." };
    return { ok: true, completion: updated };
  } catch (error) {
    const message = (error as Error).message;
    failPayout(completion.id, message, wallet.toBase58());
    return { ok: false, status: 502, error: message };
  }
}

export function completionForSession(sessionId: string): Completion | null {
  return getCompletion(sessionId);
}
