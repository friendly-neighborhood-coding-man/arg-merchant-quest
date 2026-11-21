import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CLUSTER_LABEL,
  CREDITS_PER_REWARD_TOKEN,
  CIRCLE_DEVNET_USDC_MINT,
  REWARD_BASE_UNITS,
  REWARD_CONVERSION_COPY,
  REWARD_CREDITS,
  REWARD_TOKEN_DECIMALS,
  explorerAddress,
  explorerTx,
  rewardMintConfig,
  treasuryKeypair,
} from "./config";
import { baseConnection } from "./connections";

export interface RewardDisplay {
  credits: number;
  baseUnits: number;
  tokenAmount: string;
  symbol: string;
  name: string;
  mint: string;
  kind: "circle-usdc" | "demo-test-token";
  isCircleUsdc: boolean;
  decimals: number;
  creditsPerToken: number;
  conversionCopy: string;
  cluster: string;
  treasury: string;
  explorerMintUrl: string;
}

export async function rewardDisplay(): Promise<RewardDisplay | null> {
  try {
    const config = rewardMintConfig();
    const treasury = treasuryKeypair();
    return {
      credits: REWARD_CREDITS,
      baseUnits: REWARD_BASE_UNITS,
      tokenAmount: (REWARD_BASE_UNITS / 10 ** REWARD_TOKEN_DECIMALS).toFixed(2),
      symbol: config.symbol,
      name: config.name,
      mint: config.mint.toBase58(),
      kind: config.kind,
      isCircleUsdc: config.kind === "circle-usdc" && config.mint.toBase58() === CIRCLE_DEVNET_USDC_MINT,
      decimals: config.decimals,
      creditsPerToken: CREDITS_PER_REWARD_TOKEN,
      conversionCopy: REWARD_CONVERSION_COPY,
      cluster: CLUSTER_LABEL,
      treasury: treasury.publicKey.toBase58(),
      explorerMintUrl: explorerAddress(config.mint.toBase58()),
    };
  } catch {
    return null;
  }
}

export interface TokenBalance {
  owner: string;
  tokenAccount: string;
  exists: boolean;
  baseUnits: number;
  amount: string;
  explorerUrl: string;
}

export async function readTokenBalance(owner: PublicKey, mint: PublicKey): Promise<TokenBalance> {
  const connection = baseConnection();
  const tokenAccount = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID);
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", TOKEN_PROGRAM_ID);
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
    const baseUnits = Number(account.amount);
    return {
      owner: owner.toBase58(),
      tokenAccount: tokenAccount.toBase58(),
      exists: true,
      baseUnits,
      amount: (baseUnits / 10 ** mintInfo.decimals).toFixed(mintInfo.decimals),
      explorerUrl: explorerAddress(tokenAccount.toBase58()),
    };
  } catch {
    return {
      owner: owner.toBase58(),
      tokenAccount: tokenAccount.toBase58(),
      exists: false,
      baseUnits: 0,
      amount: (0).toFixed(REWARD_TOKEN_DECIMALS),
      explorerUrl: explorerAddress(tokenAccount.toBase58()),
    };
  }
}

export interface RewardReceipt {
  signature: string;
  explorerUrl: string;
  mint: string;
  symbol: string;
  isCircleUsdc: boolean;
  amountBaseUnits: number;
  amount: string;
  sender: string;
  recipient: string;
  recipientTokenAccount: string;
  recipientBeforeBaseUnits: number;
  recipientAfterBaseUnits: number;
  recipientTokenAccountUrl: string;
  confirmedAt: string;
}

/**
 * Real SPL token transfer on Solana Devnet, signed by the demo treasury.
 * The recipient only needs a public key: the treasury pays the fee and creates
 * the recipient's associated token account if it does not exist yet.
 */
export async function sendReward(recipient: PublicKey): Promise<RewardReceipt> {
  const connection = baseConnection();
  const treasury = treasuryKeypair();
  const config = rewardMintConfig();
  const mint = config.mint;

  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
  if (mintInfo.decimals !== REWARD_TOKEN_DECIMALS) {
    throw new Error(
      `The reward mint has ${mintInfo.decimals} decimals but the demo reward is configured for ${REWARD_TOKEN_DECIMALS}.`,
    );
  }

  const source = await getAssociatedTokenAddress(mint, treasury.publicKey, false, TOKEN_PROGRAM_ID);
  const destination = await getAssociatedTokenAddress(mint, recipient, false, TOKEN_PROGRAM_ID);

  const before = await readTokenBalance(recipient, mint);

  const sourceInfo = await getAccount(connection, source, "confirmed", TOKEN_PROGRAM_ID);
  if (Number(sourceInfo.amount) < REWARD_BASE_UNITS) {
    throw new Error(
      `The demo treasury is out of test tokens (${Number(sourceInfo.amount)} base units left, ${REWARD_BASE_UNITS} needed). Run "npm run chain:setup" to top it up.`,
    );
  }

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      treasury.publicKey,
      destination,
      recipient,
      mint,
      TOKEN_PROGRAM_ID,
    ),
    createTransferInstruction(
      source,
      destination,
      treasury.publicKey,
      REWARD_BASE_UNITS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = treasury.publicKey;
  transaction.recentBlockhash = blockhash;
  transaction.sign(treasury);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(`The Devnet transfer failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  const after = await readTokenBalance(recipient, mint);

  return {
    signature,
    explorerUrl: explorerTx(signature),
    mint: mint.toBase58(),
    symbol: config.symbol,
    isCircleUsdc: config.kind === "circle-usdc" && mint.toBase58() === CIRCLE_DEVNET_USDC_MINT,
    amountBaseUnits: REWARD_BASE_UNITS,
    amount: (REWARD_BASE_UNITS / 10 ** REWARD_TOKEN_DECIMALS).toFixed(2),
    sender: treasury.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    recipientTokenAccount: destination.toBase58(),
    recipientBeforeBaseUnits: before.baseUnits,
    recipientAfterBaseUnits: after.baseUnits,
    recipientTokenAccountUrl: explorerAddress(destination.toBase58()),
    confirmedAt: new Date().toISOString(),
  };
}
