// Deterministic ZIP writer and reader for OpenAI submission packages.
// No dependencies. Every archive path is written with POSIX "/" separators and a
// fixed timestamp, so the same inputs always produce byte-identical bytes.
//
// The writer exists because the first OpenAI submission was rejected for Windows
// "\" archive entry paths: building the archive here, rather than shelling out to
// a platform zip tool, makes that failure structurally impossible.
import { deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL_SIG = 0x04034b50, CEN_SIG = 0x02014b50, EOCD_SIG = 0x06054b50;
// 1980-01-01 00:00:00, the earliest representable DOS timestamp.
const DOS_TIME = 0, DOS_DATE = 0x0021;
const UNIX = 3, VERSION = 20, MODE = 0o644;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** POSIX archive path: "/" separators, no drive letter, no leading "/", no "." or "..". */
export function archivePath(p) {
  const posix = String(p)
    .split("\\").join("/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  if (/^[a-zA-Z]:/.test(posix)) throw new Error(`absolute archive path: ${p}`);
  if (posix.split("/").some((seg) => seg === "." || seg === "..")) throw new Error(`relative segment in archive path: ${p}`);
  if (!posix) throw new Error("empty archive path");
  return posix;
}

/**
 * @param {{name: string, data: Buffer}[]} entries
 * @returns {Buffer} a deflate-compressed, deterministic ZIP archive
 */
export function zipWrite(entries) {
  const seen = new Set();
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = archivePath(e.name);
    if (seen.has(name)) throw new Error(`duplicate archive entry: ${name}`);
    seen.add(name);
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const deflated = deflateRawSync(data, { level: 9 });
    // Store when deflate does not help, exactly as a conforming zip tool would.
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(LOCAL_SIG, 0);
    lh.writeUInt16LE(VERSION, 4);
    lh.writeUInt16LE(0, 6);           // flags: names are ASCII, so no UTF-8 bit
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(CEN_SIG, 0);
    ch.writeUInt16LE((UNIX << 8) | VERSION, 4);
    ch.writeUInt16LE(VERSION, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);          // extra
    ch.writeUInt16LE(0, 32);          // comment
    ch.writeUInt16LE(0, 34);          // disk
    ch.writeUInt16LE(0, 36);          // internal attrs
    ch.writeUInt32LE((MODE & 0xffff) << 16, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, central, eocd]);
}

/**
 * Read an archive through its central directory, the way an extractor does, and
 * verify every entry's CRC. `rawName` is the undecoded name, so a caller can
 * assert that no "\" ever reached the archive.
 * @returns {{entries: {name: string, rawName: string, data: Buffer, method: number, size: number, compressedSize: number}[]}}
 */
export function zipRead(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record: not a ZIP archive");
  const count = buf.readUInt16LE(eocd + 10);
  const cenSize = buf.readUInt32LE(eocd + 12);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (cenOffset + cenSize > buf.length) throw new Error("central directory runs past end of file");
  const entries = [];
  let p = cenOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`central directory entry ${i} has a bad signature`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const rawName = buf.toString("binary", p + 46, p + 46 + nlen);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    if (buf.readUInt32LE(lho) !== LOCAL_SIG) throw new Error(`${name}: bad local header signature`);
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const body = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) data = inflateRawSync(body);
    else throw new Error(`${name}: unsupported compression method ${method}`);
    if (data.length !== size) throw new Error(`${name}: uncompressed size ${data.length} != declared ${size}`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch (archive corrupt)`);
    entries.push({ name, rawName, data, method, size, compressedSize: csize });
    p += 46 + nlen + elen + clen;
  }
  return { entries };
}
