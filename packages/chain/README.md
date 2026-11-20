# Solana / MagicBlock integration (planned)

Use an actual MagicBlock-supported state transition in the Devnet demo; a plain SPL token transfer alone is not proof of a MagicBlock integration.

Use a separate real Devnet test-token transaction to demonstrate payout/settlement. Show transaction signature, final status, and explorer link. The token may resemble USDC in decimals/display but **must never be represented as real Circle USDC** unless it truly is.

Keep MagicBlock integration thin and replaceable. Prototype stage: use native chain protections; custom security hardening follows the working E2E.
