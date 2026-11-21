/**
 * Standalone check of the P0.3 chain leg, outside the web app:
 *
 *   npx tsx scripts/chain/selftest.ts
 *
 * It runs the same code the API routes run: create a campaign counter account,
 * delegate it to a MagicBlock Ephemeral Rollup, increment it on the ER, commit
 * it to Solana, then send one real SPL test-token reward to a fresh wallet.
 */
import { Keypair } from "@solana/web3.js";
import { recordVerifiedCompletion, readCounterState } from "../../src/lib/chain/counter";
import { readTokenBalance, rewardDisplay, sendReward } from "../../src/lib/chain/reward";
import { rewardMintConfig } from "../../src/lib/chain/config";

async function main() {
  const campaignId = process.env.SELFTEST_CAMPAIGN ?? "cmp_chain_selftest";
  const display = await rewardDisplay();
  console.log("reward display:", display);

  const first = await recordVerifiedCompletion(campaignId);
  console.log("first completion:", first);
  const second = await recordVerifiedCompletion(campaignId);
  console.log("second completion:", second);

  const state = await readCounterState(campaignId);
  console.log("counter state:", state);

  const recipient = Keypair.generate();
  const before = await readTokenBalance(recipient.publicKey, rewardMintConfig().mint);
  const receipt = await sendReward(recipient.publicKey);
  const after = await readTokenBalance(recipient.publicKey, rewardMintConfig().mint);
  console.log("recipient before:", before);
  console.log("receipt:", receipt);
  console.log("recipient after:", after);

  console.log(
    JSON.stringify(
      {
        ok:
          Boolean(second.incrementSignature) &&
          second.counterValue === 2 &&
          second.committedValue === 2 &&
          after.baseUnits - before.baseUnits === receipt.amountBaseUnits,
        programId: second.programId,
        counterAccount: second.counterAccount,
        erEndpoint: second.erEndpoint,
        delegateSignature: first.delegateSignature,
        incrementSignature: second.incrementSignature,
        commitSignature: second.commitSignature,
        counterValue: second.counterValue,
        committedValue: second.committedValue,
        payoutSignature: receipt.signature,
        payoutAmountBaseUnits: receipt.amountBaseUnits,
        recipientDelta: after.baseUnits - before.baseUnits,
        recipient: receipt.recipient,
        mint: receipt.mint,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
