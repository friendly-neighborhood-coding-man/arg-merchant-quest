# Instructions for coding agents

## Mission
Build a **working, enjoyable** MagicBlock/Solana real-world ARG merchant promotion MVP. Target the hackathon demonstration, not a research-grade system.

## Order of work
1. Deliver **one organic vertical slice**: merchant campaign -> operator approval -> visitor online/physical clues -> camera evidence -> Devnet reward transaction -> ARG completion -> coupon issued -> staff redemption -> merchant dashboard.
2. Make this slice fun, coherent, responsive and clearly understandable.
3. Rehearse a complete demo with verifiable blockchain evidence.
4. Only then consider application-specific anti-replay, payout caps, security audits, elaborate tests, legal analysis, and scale work.

## Guardrails
- Solana **Devnet and valueless test tokens only** until explicitly changed. Never use mainnet keys or real customer money in prototype.
- Do not fake transaction completion or MagicBlock execution. A failed integration is reported as failed.
- Use native MagicBlock/Solana primitives where appropriate; do not claim they automatically enforce offchain limits.
- No first-solver contests or first-come rush mechanics.
- Constant base reward, regardless of hints, speed, or ARG skill.
- Only merchant-approved physical spaces, with explicit camera/location permissions.
- Coupon is a demo entitlement with visible conditions, not a real redeemable financial instrument.
- Keep architecture small: preferably one Next.js web app, one thin chain package, and simple persistent storage.
- Never commit private keys, tokens, personal photo data, or sensitive customer information.

## Definition of P0 done
A fresh reviewer can click through the whole journey from merchant creation to coupon redemption. The claimed Devnet transfer and MagicBlock integration are genuinely executed and externally verifiable. No separate security gate before E2E.

See `docs/MVP.md`. Keep status/evidence updated instead of claiming work that has not happened.
