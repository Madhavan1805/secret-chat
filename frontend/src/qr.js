// Tiny QR code generator (byte mode, error-correction level M, versions 1-6 = up to 106 bytes).
// Enough for "secretchat:add:<username>". No dependencies.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

const rsDivisor = (deg) => {
  const r = new Array(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i += 1) {
    for (let j = 0; j < deg; j += 1) {
      r[j] = mul(r[j], root);
      if (j + 1 < deg) r[j] ^= r[j + 1];
    }
    root = mul(root, 2);
  }
  return r;
};
const rsRemainder = (data, div) => {
  const r = new Array(div.length).fill(0);
  data.forEach((b) => {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  });
  return r;
};

// level M: [ecc codewords per block, number of blocks, data codewords per block]
const VERSIONS = [null, [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27]];

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  for (let v = 1; v <= 6; v += 1) {
    const cap = VERSIONS[v][1] * VERSIONS[v][2];
    if (bytes.length + 2 <= cap) { version = v; break; }       // 4+8 bits header ~ 2 bytes
  }
  if (!version) throw new Error('Text too long for QR');
  const [eccLen, blocks, dataPerBlock] = VERSIONS[version];
  const dataCap = blocks * dataPerBlock;

  // ---- bit stream
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < dataCap * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // ---- error correction + interleave
  const div = rsDivisor(eccLen);
  const dBlocks = []; const eBlocks = [];
  for (let b = 0; b < blocks; b += 1) {
    const d = data.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
    dBlocks.push(d); eBlocks.push(rsRemainder(d, div));
  }
  const all = [];
  for (let i = 0; i < dataPerBlock; i += 1) dBlocks.forEach((d) => all.push(d[i]));
  for (let i = 0; i < eccLen; i += 1) eBlocks.forEach((e) => all.push(e[i]));

  // ---- matrix
  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (version >= 2) {
    const c = size - 7;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask;                     // level M = 00
    let rem = d;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  // ---- data placement
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && n < all.length * 8) { mod[y][x] = ((all[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0; n += 1; }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
  ];
  const applyMask = (m) => { for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };

  const penalty = () => {
    let p = 0;
    const line = (get) => {
      let run = 1;
      for (let i = 1; i < size; i += 1) {
        if (get(i) === get(i - 1)) { run += 1; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
      }
    };
    for (let y = 0; y < size; y += 1) line((i) => mod[y][i]);
    for (let x = 0; x < size; x += 1) line((i) => mod[i][x]);
    for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) {
      const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    const pat = [true, false, true, true, true, false, true, false, false, false, false];
    const rev = [...pat].reverse();
    const match = (get, p2, s) => p2.every((v, k) => get(s + k) === v);
    for (let a = 0; a < size; a += 1) for (let s = 0; s + 11 <= size; s += 1) {
      if (match((i) => mod[a][i], pat, s) || match((i) => mod[a][i], rev, s)) p += 40;
      if (match((i) => mod[i][a], pat, s) || match((i) => mod[i][a], rev, s)) p += 40;
    }
    let dark = 0; mod.forEach((r) => r.forEach((v) => { if (v) dark += 1; }));
    p += Math.floor(Math.abs((dark * 20) - (size * size * 10)) / (size * size)) * 10;
    return p;
  };

  let best = 0; let bestScore = Infinity;
  for (let m = 0; m < 8; m += 1) {
    applyMask(m); drawFormat(m);
    const s = penalty();
    if (s < bestScore) { bestScore = s; best = m; }
    applyMask(m);                                   // undo
  }
  applyMask(best); drawFormat(best);
  return mod;
}
