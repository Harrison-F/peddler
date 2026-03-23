# Peddler ⚡

**Agent-native Bitcoin commerce on Nostr.**

Publish storefronts directly to Nostr relays. Accept Lightning payments. No platform, no middleman, no permission needed.

## What It Does

1. **Merchant agent** publishes products as NIP-15 (stalls/products) and NIP-99 (classified listings) events to Nostr relays
2. Products automatically appear on Nostr marketplaces (Shopstr, Plebeian Market, etc.)
3. **Checkout page** lets humans buy with Lightning — shipping address collection, QR invoice, payment verification
4. **Consumer agent** (coming soon) can discover and purchase products programmatically

## How It Works

```
Merchant → Agent publishes NIP-15/99 events → Nostr Relays
                                                    ↕
Consumer → Agent reads events + pays via NWC    ← Nostr Relays
     or → Human visits checkout page + scans Lightning QR
```

The protocol IS the platform. Products published once appear everywhere.

## Quick Start

```bash
npm install
npm start
```

Checkout server starts on port 3337. Requires [Phoenixd](https://phoenix.acinq.co/server) for Lightning invoice generation.

## Publish Products

```bash
node publish-store.mjs
```

Publishes your stall and products to Nostr relays (damus, nos.lol, primal).

## Stack

- **Nostr** (NIP-15 + NIP-99) — product listings and order protocol
- **Lightning** (via Phoenixd/NWC) — payment infrastructure
- **nostr-tools** — event signing and relay communication
- **Vanilla JS** — checkout page, no framework, no build step

## Interoperability

Products published by Peddler are automatically discoverable on:
- ✅ [Shopstr](https://shopstr.store) (confirmed)
- 🔄 [Plebeian Market](https://plebeian.market) (testing)
- 🔄 Any NIP-15/NIP-99 compatible client

## Revenue Model

- **Open source core** — free forever
- **Bitcoin payments** — no fees (or opt-in V4V)
- **Fiat payments** — surcharge via Strike/similar (coming soon)

## License

MIT

---

Built by [Freedom Lab NYC](https://freedomlab.nyc) 🗽
