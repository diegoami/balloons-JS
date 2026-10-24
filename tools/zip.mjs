/**
 * A deterministic, dependency-free ZIP writer, for the itch.io HTML5 build.
 * Reused from Scopetta's tools/zip_lib.mjs (originally Tressette's).
 *
 * node has no built-in zip, and the project ships no runtime dependencies, so
 * the encoder is hand-rolled here rather than pulling one in. It is separated
 * from tools/package_itch.mjs. The extracted-artifact smoke independently
 * checks its output with the operating system's ZIP extractor.
 *
 * Format per APPNOTE.TXT: a local file header and data per entry, then the
 * central directory, then the end-of-central-directory record. Names are UTF-8
 * (general-purpose bit 11), the DOS timestamp is fixed at 1980-01-01, and the
 * caller sorts the entries, so the same input always writes the same bytes.
 * CRC-32 is the reflected IEEE 802.3 polynomial 0xEDB88320.
 */
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// entries: [{ name, data }] with forward-slash names, already sorted by the
// caller (or sorted here). Returns the whole archive as a Buffer.
export function buildZip(entries){
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const e of sorted){
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data);
    const method = deflated.length < data.length ? 0x08 : 0x00;
    const payload = method === 0x08 ? deflated : data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6);       // general purpose bit flag (UTF-8)
    local.writeUInt16LE(method, 8);       // compression method
    local.writeUInt16LE(0, 10);           // last mod file time (midnight)
    local.writeUInt16LE(0x0021, 12);      // last mod file date (1980-01-01)
    local.writeUInt32LE(crc, 14);         // crc-32
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    localChunks.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(0x031e, 4);     // version made by (UNIX, 3.0)
    central.writeUInt16LE(20, 6);         // version needed to extract
    central.writeUInt16LE(0x0800, 8);     // general purpose bit flag
    central.writeUInt16LE(method, 10);    // compression method
    central.writeUInt16LE(0, 12);         // last mod file time (midnight)
    central.writeUInt16LE(0x0021, 14);    // last mod file date (1980-01-01)
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // file comment length
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal file attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // UNIX regular file, readable after extraction
    central.writeUInt32LE(offset, 42);    // relative offset of local header
    centralChunks.push(central, nameBuf);

    offset += 30 + nameBuf.length + payload.length;
  }

  const cdSize = centralChunks.reduce((n, c) => n + c.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // EOCD signature
  eocd.writeUInt16LE(0, 4);               // number of this disk
  eocd.writeUInt16LE(0, 6);               // disk where CD starts
  eocd.writeUInt16LE(sorted.length, 8);   // CD records on this disk
  eocd.writeUInt16LE(sorted.length, 10);  // total CD records
  eocd.writeUInt32LE(cdSize, 12);         // size of central directory
  eocd.writeUInt32LE(offset, 16);         // offset of start of CD
  eocd.writeUInt16LE(0, 20);              // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}
