#!/usr/bin/env node
/**
 * Verify backend API responses match what the frontend expects.
 * Run with: node scripts/verify-be-api.js
 * Requires backend at http://localhost:8082 (or set BASE_URL env).
 */
const BASE = process.env.BASE_URL || 'http://localhost:8082';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
}

async function main() {
  console.log('Backend base:', BASE);
  console.log('');

  const checks = [
    ['GET /api (ready)', '/api', (r) => r.ok && r.data && r.data.message],
    ['GET /api/templates', '/api/templates', (r) => r.ok && Array.isArray(r.data)],
    ['GET /api/configs', '/api/configs', (r) => r.ok && Array.isArray(r.data)],
    ['GET /api/components', '/api/components', (r) => r.ok && Array.isArray(r.data)],
  ];

  for (const [label, path, validator] of checks) {
    const r = await get(path);
    const pass = validator(r);
    console.log(pass ? '✓' : '✗', label);
    console.log('  status:', r.status, '|', pass ? 'OK' : 'UNEXPECTED');
    if (!r.ok && r.text) console.log('  body:', r.text);
    if (r.data && path === '/api/templates' && Array.isArray(r.data)) {
      console.log('  templates count:', r.data.length);
      if (r.data.length > 0) {
        const t = r.data[0];
        const has = { id: !!t.id, name: !!t.name, configJson: 'configJson' in t };
        console.log('  first template keys:', has);
      }
    }
    if (r.data && path === '/api/configs' && Array.isArray(r.data)) {
      console.log('  configs count:', r.data.length);
    }
    if (r.data && path === '/api/components' && Array.isArray(r.data)) {
      console.log('  components count:', r.data.length);
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
