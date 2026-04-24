# Boltz Core integration guide

`boltz-core` is a low-level library (Taproot scripts, MuSig2, claim/refund
builders, swap-tree serialization). Anything beyond the primitives like key
storage, retries, claim workers, recovery or UX belongs to the integrating
app.

## 1. Read the docs

Start at <https://api.docs.boltz.exchange/llms.txt>. If this guide and the docs
disagree, the docs win.

These pages are the most commonly overlooked and are responsible for almost
every "lost funds" scenario we see. Read them before writing integration code:

- [Claims & Refunds](https://api.docs.boltz.exchange/claiming-swaps.md) —
  Boltz never claims for users; UTXO Reverse/Chain swaps must be claimed by
  the client. Always implement cooperative MuSig2 **and** script-path fallback.
- [Swap Restore](https://api.docs.boltz.exchange/swap-restore.md) —
  derivation paths, rescue xpub, and deterministic preimages (`sha256(privateKey)`). Must be byte-compatible with Boltz Web App or Boltz-hosted rescue will fail.
- [Common Mistakes](https://api.docs.boltz.exchange/common-mistakes.md) —
  store swap data permanently, stay client-side, come online before timeouts,
  retry, and use a single lockup transaction.
- [Don't trust. Verify!](https://api.docs.boltz.exchange/dont-trust-verify.md) —
  verify addresses, redeem scripts, invoices, and contract bytecode locally;
  recompute swap amounts; never trust API responses blindly.

## 2. Use Boltz Web App as the reference implementation

<https://github.com/BoltzExchange/boltz-web-app> is the canonical consumer of
`boltz-core`. **Never implement anything on top of `boltz-core` without first
checking how `boltz-web-app` does it.** If your code diverges, assume the web
app is right.

Useful starting points in `boltz-web-app/src/utils/`:

- `claim.ts` — cooperative claim + script-path fallback for all swap types
- `rescue.ts` — refund flows, rescue list, asset rescue
- `rescueFile.ts` / `rescueDerivation.ts` — rescue file format, derivation
  paths, deterministic preimages
- `swapCreator.ts` — per-swap key + preimage generation
- `taproot/musig.ts` — `createMusig` / `tweakMusig`, key ordering

For an initial version, link end users to <https://boltz.exchange/rescue/external>
instead of re-implementing rescue state machines and flows. Staying byte-
compatible with this hosted rescue flow is critical so users always have it as
a fallback.

## 3. Stop conditions

If you cannot match [Swap Restore](https://api.docs.boltz.exchange/swap-restore.md) entirely or e.g. cannot implement both cooperative and script-path paths from
[Claims & Refunds](https://api.docs.boltz.exchange/claiming-swaps.md), stop
and ask. Do not ship a partial integration.
