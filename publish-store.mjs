/**
 * Freedom Lab NYC Sticker Store — NIP-15 + NIP-99 Prototype
 * 
 * Publishes a stall (kind 30017) and product (kind 30018) to Nostr relays,
 * plus a NIP-99 classified listing (kind 30402) for Shopstr compatibility.
 * 
 * Uses Wren's Nostr identity.
 */

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
// hexToBytes utility
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
import WebSocket from 'ws';

// Wren's keys (loaded from secrets)
import { readFileSync } from 'fs';
const secrets = JSON.parse(readFileSync('/Users/harrison/.openclaw/secrets.json', 'utf8'));
const SECRET_KEY = hexToBytes(secrets.wren_nostr.secret_key_hex);
const PUBLIC_KEY = secrets.wren_nostr.public_key_hex;

console.log('Publishing as:', PUBLIC_KEY);
console.log('npub:', secrets.wren_nostr.npub);

// Relay list
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
];

// Stall ID and Product ID
const STALL_ID = 'freedom-lab-nyc-store';
const PRODUCT_ID = 'fl-sticker-01';

// Image URL (served via Tailscale Funnel)
const IMAGE_URL = 'https://harrisons-macbook-air.tail323ae0.ts.net/nostr-commerce/sticker.png';

// ============================================================
// NIP-15: Kind 30017 — Create Stall
// ============================================================
const stallContent = JSON.stringify({
  id: STALL_ID,
  name: 'Freedom Lab NYC',
  description: 'Freedom tech education, community, and tools. NYC-based. Bitcoin at the core.',
  currency: 'sat',
  shipping: [
    {
      id: 'us-standard',
      name: 'US Standard',
      cost: 2000,  // 2000 sats for shipping
      regions: ['United States']
    },
    {
      id: 'international',
      name: 'International',
      cost: 5000,  // 5000 sats for international
      regions: ['Worldwide']
    }
  ]
});

const stallEvent = finalizeEvent({
  kind: 30017,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', STALL_ID],
  ],
  content: stallContent,
}, SECRET_KEY);

console.log('\n=== STALL EVENT (kind 30017) ===');
console.log('ID:', stallEvent.id);
console.log('Content:', JSON.parse(stallEvent.content).name);

// ============================================================
// NIP-15: Kind 30018 — Create Product
// ============================================================
const productContent = JSON.stringify({
  id: PRODUCT_ID,
  stall_id: STALL_ID,
  name: 'Freedom Lab NYC Sticker',
  description: 'Pixel art Statue of Liberty torch sticker. Die-cut, weatherproof vinyl. ~3 inches. Rep freedom tech in NYC.',
  images: [IMAGE_URL],
  currency: 'sat',
  price: 5000,  // 5000 sats (~$3.60)
  quantity: 100,
  specs: [
    ['Size', '~3 inches'],
    ['Material', 'Weatherproof vinyl'],
    ['Style', 'Die-cut'],
  ],
  shipping: [
    {
      id: 'us-standard',
      cost: 0  // Free shipping for stickers (covered by stall shipping)
    }
  ]
});

const productEvent = finalizeEvent({
  kind: 30018,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', PRODUCT_ID],
    ['t', 'sticker'],
    ['t', 'freedom-tech'],
    ['t', 'bitcoin'],
    ['t', 'nyc'],
  ],
  content: productContent,
}, SECRET_KEY);

console.log('\n=== PRODUCT EVENT (kind 30018) ===');
console.log('ID:', productEvent.id);
console.log('Content:', JSON.parse(productEvent.content).name);
console.log('Price:', JSON.parse(productEvent.content).price, 'sats');

// ============================================================
// NIP-99: Kind 30402 — Classified Listing (Shopstr compat)
// ============================================================
const classifiedEvent = finalizeEvent({
  kind: 30402,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', PRODUCT_ID],
    ['title', 'Freedom Lab NYC Sticker'],
    ['summary', 'Pixel art Statue of Liberty torch sticker. Die-cut, weatherproof vinyl. ~3 inches. Rep freedom tech in NYC.'],
    ['published_at', String(Math.floor(Date.now() / 1000))],
    ['location', 'New York City'],
    ['price', '5000', 'sat'],
    ['t', 'sticker'],
    ['t', 'freedom-tech'],
    ['t', 'bitcoin'],
    ['t', 'nyc'],
    ['image', IMAGE_URL],
  ],
  content: 'Freedom Lab NYC Sticker — Pixel art Statue of Liberty torch. Die-cut, weatherproof vinyl, ~3 inches. Perfect for laptops, water bottles, or anything that needs more freedom. 5,000 sats. Ships anywhere in the US.',
}, SECRET_KEY);

console.log('\n=== CLASSIFIED LISTING (kind 30402) ===');
console.log('ID:', classifiedEvent.id);

// ============================================================
// Publish to relays
// ============================================================
async function publishToRelay(url, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout connecting to ${url}`));
    }, 10000);

    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      const msg = JSON.stringify(['EVENT', event]);
      ws.send(msg);
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());
      if (response[0] === 'OK') {
        clearTimeout(timeout);
        const success = response[2];
        const message = response[3] || '';
        console.log(`  ${url}: ${success ? '✅' : '❌'} ${message}`);
        ws.close();
        resolve(success);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.log(`  ${url}: ❌ ${err.message}`);
      reject(err);
    });
  });
}

async function publishAll() {
  console.log('\n=== PUBLISHING TO RELAYS ===\n');
  
  for (const relay of RELAYS) {
    console.log(`Publishing stall to ${relay}...`);
    try {
      await publishToRelay(relay, stallEvent);
    } catch (e) {
      console.log(`  ${relay}: ❌ ${e.message}`);
    }

    console.log(`Publishing product to ${relay}...`);
    try {
      await publishToRelay(relay, productEvent);
    } catch (e) {
      console.log(`  ${relay}: ❌ ${e.message}`);
    }

    console.log(`Publishing classified to ${relay}...`);
    try {
      await publishToRelay(relay, classifiedEvent);
    } catch (e) {
      console.log(`  ${relay}: ❌ ${e.message}`);
    }
    
    console.log('');
  }

  console.log('=== DONE ===');
  console.log('\nCheck these URLs:');
  console.log(`  Plebeian Market: https://plebeian.market/p/${secrets.wren_nostr.npub}`);
  console.log(`  Shopstr: https://shopstr.store/`);
  console.log(`  Nostr.band: https://nostr.band/${secrets.wren_nostr.npub}`);
  
  process.exit(0);
}

publishAll();
