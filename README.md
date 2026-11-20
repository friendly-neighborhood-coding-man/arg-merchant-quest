# ARG Merchant Quest

> **Status: repository scaffold — not a working app yet.** No live payments, ARG verification, or coupon redemption have been implemented.

A real-world ARG advertising experience powered by Solana and MagicBlock. Merchants publish clue-driven campaigns; visitors discover approved online/in-store clues, photograph a target object, earn a fixed visit reward, and optionally unlock a merchant-specific secret-menu coupon.

**KR:** 매장과 온라인 단서를 연결한 위치 기반 ARG 광고 플랫폼. 실제 방문 탐색과 고정 보상, 선택형 스토리, 비밀 메뉴 쿠폰을 하나의 경험으로 연결합니다.

## Hackathon objective

**First make one complete journey work.** Focus on a playable E2E and demo quality, not a security framework, legal research, or broad infrastructure.

1. Merchant creates a campaign with social/site clues, an in-store object, optional 3/5-minute hints, and coupon terms.
2. Operator reviews and publishes it.
3. Visitor navigates clues, captures the object **with the app camera**, and submits permissioned evidence.
4. The prototype verifies an explicitly scoped completion condition and sends a **real Solana Devnet test-token transaction** for a fixed reward (about KRW 100 equivalent as UX copy; not a guaranteed exchange rate).
5. Completing the optional ARG unlocks a personal achievement and conditional secret-menu coupon.
6. Merchant staff redeems the coupon; merchant sees the resulting activity and test-fund history.

## Non-negotiable product decisions

- **No first-discoverer, fastest-solver, or first-come competitive rewards.** Avoid crowds and open-run incentives.
- Base reward amount is fixed; hint usage and ARG skill do not change cash rewards.
- Disclose merchant-specific coupon conditions (e.g., minimum purchase, expiration, availability) before participation.
- Use only merchant-approved and visitor-accessible physical spaces.
- Camera and location evidence are **not** cryptographic proof of physical presence.
- Initial demo uses **Devnet and valueless test assets only**, never live customer funds or real redeemable coupons.
- Reuse Solana/MagicBlock native capabilities; **custom** anti-replay, payout controls, and security hardening come **after the first working E2E**. Do not claim the chain solves offchain application risks.
- Be precise about which functions are actually implemented versus mocked/demo-only.

## Repository layout

- `apps/web/` — single web app for visitor / merchant / operator / staff (planned)
- `packages/chain/` — Solana + MagicBlock client utilities (planned)
- `docs/MVP.md` — prioritized acceptance contract
- `docs/ARCHITECTURE.md` — boundaries and data flow
- `docs/DEMO.md` — demo checklist

## Build order

**P0: real E2E** → **P1: enjoyable ARG and polished UX** → **P2: reproducible demo** → **P3: additional robustness if useful**.

No mainnet or national payment rails in this prototype. For deployment with real money, additional legal, payment, and security work is required.

## Getting started

This is an initial documentation scaffold. There is **not yet an executable web app**. Build the single journey first; see [MVP](docs/MVP.md) and [AGENTS.md](AGENTS.md).

MagicBlock docs: https://docs.magicblock.gg · Solana docs: https://solana.com/docs
