// Verifica la implementación didáctica contra los vectores de RFC 8439 y contra OpenSSL (node:crypto).
const assert = require('node:assert');
const crypto = require('node:crypto');
const C = require('../src/js/chacha.js');

// RFC 8439 §2.1.1 — quarter round
{
  const s = new Uint32Array(16);
  s[0] = 0x11111111; s[1] = 0x01020304; s[2] = 0x9b8d6f43; s[3] = 0x01234567;
  C.quarterRound(s, 0, 1, 2, 3);
  assert.deepStrictEqual(Array.from(s.slice(0, 4)), [0xea2a92f4, 0xcb1cf8ce, 0x4581472e, 0x5881c4bb]);
}

// RFC 8439 §2.3.2 — bloque ChaCha20
{
  const key = C.fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const nonce = C.fromHex('000000090000004a00000000');
  const out = C.block(key, 1, nonce);
  assert.strictEqual(C.toHex(out.subarray(0, 16)), '10f1e7e4d13b5915500fdd1fa32071c4');
}

// RFC 8439 §2.5.2 — Poly1305
{
  const key = C.fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
  const tag = C.poly1305(key, C.utf8('Cryptographic Forum Research Group'));
  assert.strictEqual(C.toHex(tag), 'a8061dc1305136c6c22b8baf0c0127a9');
}

// RFC 8439 §2.8.2 — AEAD completo
const sunscreen = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
{
  const key = C.fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
  const nonce = C.fromHex('070000004041424344454647');
  const aad = C.fromHex('50515253c0c1c2c3c4c5c6c7');
  const { ciphertext, tag } = C.aeadEncrypt(key, nonce, C.utf8(sunscreen), aad);
  assert.strictEqual(C.toHex(ciphertext.subarray(0, 16)), 'd31a8d34648e60db7b86afbc53ef7ec2');
  assert.strictEqual(C.toHex(tag), '1ae10b594f09e26a7e902ecbd0600691');
  assert.strictEqual(C.fromUtf8(C.aeadDecrypt(key, nonce, ciphertext, tag, aad)), sunscreen);
  const tampered = ciphertext.slice(); tampered[0] ^= 1;
  assert.strictEqual(C.aeadDecrypt(key, nonce, tampered, tag, aad), null);
}

// Comparación aleatoria contra OpenSSL
for (let i = 0; i < 200; i++) {
  const key = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
  const pt = crypto.randomBytes(Math.floor(Math.random() * 300));
  const aad = crypto.randomBytes(Math.floor(Math.random() * 40));
  const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  c.setAAD(aad);
  const ref = Buffer.concat([c.update(pt), c.final()]);
  const refTag = c.getAuthTag();
  const mine = C.aeadEncrypt(new Uint8Array(key), new Uint8Array(nonce), new Uint8Array(pt), new Uint8Array(aad));
  assert.strictEqual(C.toHex(mine.ciphertext), ref.toString('hex'));
  assert.strictEqual(C.toHex(mine.tag), refTag.toString('hex'));
}

console.log('OK: vectores RFC 8439 (§2.1.1, §2.3.2, §2.5.2, §2.8.2) + 200 casos aleatorios vs OpenSSL');
