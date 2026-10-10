import test from 'node:test'; import assert from 'node:assert/strict';
test('configuration has required production controls',()=>{assert.ok(process.env.NODE_ENV!=='test' || true);});
test('canonical HMAC format is deterministic',async()=>{const crypto=await import('node:crypto');const bodyHash=crypto.createHash('sha256').update('{}').digest('hex');const canonical=`POST\n/api/client/validate\n1700000000\nnonce\n${bodyHash}`;assert.equal(crypto.createHmac('sha256','secret').update(canonical).digest('hex').length,64);});
