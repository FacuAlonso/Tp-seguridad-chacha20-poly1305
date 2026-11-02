/*
 * ChaCha20-Poly1305 (RFC 8439) — implementación didáctica.
 * Expone trazas internas (estado por ronda, pasos del quarter round,
 * acumulador de Poly1305) para las visualizaciones de la presentación.
 * Funciona en el navegador (window.ChaCha) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  const CONSTANTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"
  const COLUMN_ROUND = [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15]];
  const DIAGONAL_ROUND = [[0, 5, 10, 15], [1, 6, 11, 12], [2, 7, 8, 13], [3, 4, 9, 14]];

  const rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;

  function readU32LE(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  }

  // Quarter round sobre el estado s (Uint32Array). Si se pasa `steps`, registra cada operación ARX.
  function quarterRound(s, a, b, c, d, steps) {
    const ops = [
      ['add', a, b], ['xor', d, a], ['rot', d, 16],
      ['add', c, d], ['xor', b, c], ['rot', b, 12],
      ['add', a, b], ['xor', d, a], ['rot', d, 8],
      ['add', c, d], ['xor', b, c], ['rot', b, 7],
    ];
    for (const [op, x, y] of ops) {
      if (op === 'add') s[x] = (s[x] + s[y]) >>> 0;
      else if (op === 'xor') s[x] = (s[x] ^ s[y]) >>> 0;
      else s[x] = rotl(s[x], y);
      if (steps) steps.push({ op, target: x, arg: y, value: s[x] });
    }
  }

  function initialState(key, counter, nonce) {
    const s = new Uint32Array(16);
    s.set(CONSTANTS, 0);
    for (let i = 0; i < 8; i++) s[4 + i] = readU32LE(key, i * 4);
    s[12] = counter >>> 0;
    for (let i = 0; i < 3; i++) s[13 + i] = readU32LE(nonce, i * 4);
    return s;
  }

  /*
   * Bloque ChaCha20: devuelve 64 bytes de keystream.
   * Con trace=true devuelve además el estado inicial, el estado tras cada
   * una de las 20 rondas y el resultado de la suma final (feed-forward).
   */
  function block(key, counter, nonce, trace) {
    const init = initialState(key, counter, nonce);
    const s = new Uint32Array(init);
    const rounds = trace ? [] : null;
    for (let i = 0; i < 10; i++) {
      for (const [a, b, c, d] of COLUMN_ROUND) quarterRound(s, a, b, c, d);
      if (trace) rounds.push({ kind: 'columna', state: Array.from(s) });
      for (const [a, b, c, d] of DIAGONAL_ROUND) quarterRound(s, a, b, c, d);
      if (trace) rounds.push({ kind: 'diagonal', state: Array.from(s) });
    }
    const out = new Uint32Array(16);
    for (let i = 0; i < 16; i++) out[i] = (s[i] + init[i]) >>> 0;
    const bytes = new Uint8Array(out.buffer.slice(0));
    if (!trace) return bytes;
    return { bytes, initial: Array.from(init), rounds, final: Array.from(out) };
  }

  function chacha20(key, counter, nonce, input) {
    const out = new Uint8Array(input.length);
    for (let off = 0, ctr = counter; off < input.length; off += 64, ctr++) {
      const ks = block(key, ctr, nonce);
      const n = Math.min(64, input.length - off);
      for (let i = 0; i < n; i++) out[off + i] = input[off + i] ^ ks[i];
    }
    return out;
  }

  // ---------- Poly1305 (BigInt: lento pero claro) ----------
  const P1305 = (1n << 130n) - 5n;

  function leBytesToBigInt(bytes) {
    let x = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(bytes[i]);
    return x;
  }

  function bigIntTo16LE(x) {
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
    return out;
  }

  function clamp(r) {
    return r & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  }

  function poly1305(key32, msg, trace) {
    const r = clamp(leBytesToBigInt(key32.subarray(0, 16)));
    const s = leBytesToBigInt(key32.subarray(16, 32));
    let acc = 0n;
    const steps = trace ? [] : null;
    for (let off = 0; off < msg.length; off += 16) {
      const chunk = msg.subarray(off, Math.min(off + 16, msg.length));
      const n = leBytesToBigInt(chunk) + (1n << BigInt(8 * chunk.length)); // byte 0x01 extra
      acc = ((acc + n) * r) % P1305;
      if (trace) steps.push({ block: Array.from(chunk), n, acc });
    }
    const tag = bigIntTo16LE((acc + s) & ((1n << 128n) - 1n));
    if (!trace) return tag;
    return { tag, r, s, steps };
  }

  function poly1305KeyGen(key, nonce) {
    return block(key, 0, nonce).subarray(0, 32);
  }

  const pad16 = (len) => new Uint8Array((16 - (len % 16)) % 16);

  function u64LE(n) {
    const out = new Uint8Array(8);
    let x = BigInt(n);
    for (let i = 0; i < 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
    return out;
  }

  function concat(...parts) {
    const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  function macData(aad, ciphertext) {
    return concat(aad, pad16(aad.length), ciphertext, pad16(ciphertext.length),
      u64LE(aad.length), u64LE(ciphertext.length));
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  function aeadEncrypt(key, nonce, plaintext, aad = new Uint8Array(0)) {
    const otk = poly1305KeyGen(key, nonce);
    const ciphertext = chacha20(key, 1, nonce, plaintext);
    const tag = poly1305(otk, macData(aad, ciphertext));
    return { ciphertext, tag, otk };
  }

  // Devuelve el texto plano, o null si el tag no verifica (no se descifra nada).
  function aeadDecrypt(key, nonce, ciphertext, tag, aad = new Uint8Array(0)) {
    const otk = poly1305KeyGen(key, nonce);
    const expected = poly1305(otk, macData(aad, ciphertext));
    if (!constantTimeEqual(expected, tag)) return null;
    return chacha20(key, 1, nonce, ciphertext);
  }

  // ---------- utilidades ----------
  const toHex = (bytes, sep = '') => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
  const fromHex = (hex) => {
    const clean = hex.replace(/[^0-9a-f]/gi, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  };
  const word = (w) => (w >>> 0).toString(16).padStart(8, '0');
  const utf8 = (str) => new TextEncoder().encode(str);
  const fromUtf8 = (bytes) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  const api = {
    CONSTANTS, COLUMN_ROUND, DIAGONAL_ROUND, P1305,
    rotl, quarterRound, initialState, block, chacha20,
    poly1305, poly1305KeyGen, clamp, macData, aeadEncrypt, aeadDecrypt,
    constantTimeEqual, toHex, fromHex, word, utf8, fromUtf8, concat, leBytesToBigInt,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChaCha = api;
})(typeof window !== 'undefined' ? window : globalThis);
