/**
 * Freedom Lab NYC Checkout Server
 * 
 * Serves the static checkout page + provides API endpoints:
 * - POST /api/invoice — generate Lightning invoice via Phoenixd
 * - GET /api/invoice/:hash — check payment status
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Phoenixd config
const secrets = JSON.parse(fs.readFileSync('/Users/harrison/.openclaw/secrets.json', 'utf8'));
const PHOENIXD_URL = 'http://localhost:9740';
const PHOENIXD_AUTH = 'Basic ' + Buffer.from('http-password:' + secrets.phoenixd.httpPassword).toString('base64');

const PORT = 3337;

// Simple order store (in-memory for prototype)
const orders = {};

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function phoenixdRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 9740,
      path: endpoint,
      method,
      headers: {
        'Authorization': PHOENIXD_AUTH,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function handleCreateInvoice(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const order = JSON.parse(body);
      const { product_id, quantity, amount_sats, shipping } = order;

      if (!amount_sats || !shipping || !shipping.name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }

      // Convert sats to millisats for Phoenixd
      const amountMsat = amount_sats * 1000;
      const orderId = crypto.randomUUID().slice(0, 8);
      const description = `Freedom Lab NYC — ${quantity}x Sticker — Order ${orderId}`;

      // Create invoice via Phoenixd
      const params = new URLSearchParams({
        amountSat: String(amount_sats),
        description,
        externalId: orderId,
      });

      const invoice = await phoenixdRequest('/createinvoice', 'POST', params.toString());

      if (!invoice.serialized) {
        console.error('Phoenixd error:', invoice);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create invoice' }));
        return;
      }

      // Store order
      orders[invoice.paymentHash] = {
        orderId,
        product_id,
        quantity,
        amount_sats,
        shipping,
        invoice: invoice.serialized,
        paymentHash: invoice.paymentHash,
        created: new Date().toISOString(),
        paid: false,
      };

      console.log(`Order ${orderId}: ${quantity}x sticker, ${amount_sats} sats, ship to ${shipping.name} in ${shipping.city}, ${shipping.state}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        invoice: invoice.serialized,
        payment_hash: invoice.paymentHash,
        order_id: orderId,
        amount_sats,
      }));

    } catch (e) {
      console.error('Invoice error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

async function handleCheckPayment(req, res, hash) {
  const order = orders[hash];
  if (!order) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Order not found' }));
    return;
  }

  if (order.paid) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ paid: true, order_id: order.orderId }));
    return;
  }

  // Check with Phoenixd
  try {
    const payment = await phoenixdRequest(`/payments/incoming/${hash}`);
    if (payment && payment.isPaid) {
      order.paid = true;
      console.log(`✅ Order ${order.orderId} PAID! ${order.amount_sats} sats from ${order.shipping.name}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ paid: true, order_id: order.orderId }));
      return;
    }
  } catch (e) {
    // Phoenixd may not have this endpoint, try listing recent payments
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ paid: false }));
}

// Static file serving
function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Serve sticker image from the nostr-commerce app public dir
  if (filePath === '/sticker.png') {
    const stickerPath = path.join(__dirname, '..', 'app', 'public', 'sticker.png');
    if (fs.existsSync(stickerPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(stickerPath).pipe(res);
      return;
    }
  }

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  const contentType = MIME[ext] || 'application/octet-stream';

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// Server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API routes
  if (req.method === 'POST' && req.url === '/api/invoice') {
    return handleCreateInvoice(req, res);
  }

  const paymentMatch = req.url.match(/^\/api\/invoice\/([a-f0-9]+)$/);
  if (req.method === 'GET' && paymentMatch) {
    return handleCheckPayment(req, res, paymentMatch[1]);
  }

  // Static files
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡ Freedom Lab NYC Checkout`);
  console.log(`  Local:     http://localhost:${PORT}`);
  console.log(`  Tailscale: http://100.102.143.17:${PORT}`);
  console.log(`  Phoenixd:  ${PHOENIXD_URL}`);
  console.log(`\nReady for orders!\n`);
});
