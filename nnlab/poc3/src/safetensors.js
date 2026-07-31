'use strict';
/**
 * AI STUDY GUIDE: MODEL STORAGE WITH SAFETENSORS
 * ==============================================
 *
 * 1) FUNCTIONALITY
 *    This module converts named Float32Array values to the Safetensors binary
 *    format and reads them back. The training program uses it to save weights;
 *    inference uses it to restore exactly the same weights.
 *
 * 2) WHY THIS FORMAT?
 *    Neural models contain many numeric parameters. JSON would be much larger
 *    and slower because every number becomes text. Safetensors keeps a small
 *    JSON header and stores tensor values as compact binary data. Offsets in
 *    the header make every tensor's location explicit and checkable.
 *
 * 3) AI LEARNING / INFERENCE BACKGROUND
 *    Learning happens in nn.js, not in this file. This module is the bridge
 *    between two separate program runs:
 *
 *      training -> learned arrays -> model.safetensors -> restored arrays
 *                                                    -> inference
 *
 *    Saving weights allows learning to continue later and lets inference use
 *    the trained model without repeating training.
 *
 * This small project reader/writer supports F32 tensors only. The separate
 * dump_safetensors.js inspection tool supports more data types.
 *
 * Safetensors file layout:
 *
 *   [8 bytes]  little-endian unsigned integer N = header length
 *   [N bytes]  UTF-8 JSON header:
 *              { "<name>": { "dtype": "F32", "shape": [..],
 *                            "data_offsets": [begin, end] }, ...,
 *                "__metadata__": { "<key>": "<value>" } }
 *   [rest]     raw little-endian F32 tensor data buffer
 */
const fs = require('fs');

/**
 * Serialize named tensors to one in-memory Safetensors Buffer.
 *
 * "Shape" describes tensor dimensions. For example, shape [16, 4096, 80]
 * describes a three-dimensional block, while `data` is its flat memory.
 * Safetensors stores both so the shape can be reconstructed when loading.
 *
 * @param {Object<string,{data: Float32Array, shape: number[]}>} tensors
 * @param {Object<string,string>} [metadata]  string key/value pairs
 */
function serialize(tensors, metadata = {}) {
  const header = {};
  const chunks = [];
  let offset = 0;

  // Sorting makes repeated saves deterministic when all inputs are identical.
  // Deterministic files are easier to hash, compare, test, and audit.
  for (const name of Object.keys(tensors).sort()) {
    const { data, shape } = tensors[name];
    const byteLen = data.length * 4;

    // Offsets are relative to the start of the binary data section, not to the
    // start of the complete file.
    header[name] = { dtype: 'F32', shape, data_offsets: [offset, offset + byteLen] };

    // A JavaScript number is written as a 32-bit floating-point value. "LE"
    // means little-endian byte order, as required by this file representation.
    const buf = Buffer.alloc(byteLen);
    for (let i = 0; i < data.length; i++) buf.writeFloatLE(data[i], i * 4);
    chunks.push(buf);
    offset += byteLen;
  }
  if (Object.keys(metadata).length > 0) {
    header.__metadata__ = {};
    for (const [k, v] of Object.entries(metadata)) header.__metadata__[k] = String(v);
  }

  let headerBuf = Buffer.from(JSON.stringify(header), 'utf8');

  // The first eight bytes tell a reader exactly where JSON ends and raw tensor
  // data begins.
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);
  return Buffer.concat([lenBuf, headerBuf, ...chunks]);
}

/**
 * Parse a Safetensors Buffer and rebuild named Float32Array tensors.
 *
 * Bounds and size checks are important. A shape claims how many values should
 * exist, while offsets claim how many bytes were stored. Both must agree before
 * the numbers are trusted.
 *
 * @returns {{ tensors: Object<string,{data: Float32Array, shape: number[]}>, metadata: Object<string,string> }}
 */
function deserialize(buf) {
  if (buf.length < 8) throw new Error('safetensors: file too small for header length');
  const headerLen = Number(buf.readBigUInt64LE(0));
  if (8 + headerLen > buf.length) throw new Error('safetensors: header length exceeds file size');

  const header = JSON.parse(buf.subarray(8, 8 + headerLen).toString('utf8'));
  const dataStart = 8 + headerLen;
  const dataBuf = buf.subarray(dataStart);

  // Metadata explains the model but is not itself a trainable tensor.
  const tensors = {};
  const metadata = header.__metadata__ || {};
  for (const [name, info] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    if (info.dtype !== 'F32') throw new Error(`safetensors: unsupported dtype ${info.dtype}`);
    const [begin, end] = info.data_offsets;
    const numel = info.shape.reduce((a, b) => a * b, 1);
    if (begin < 0 || end < begin || end > dataBuf.length) {
      throw new Error(`safetensors: data_offsets out of bounds for tensor "${name}"`);
    }
    if ((end - begin) !== numel * 4) {
      throw new Error(`safetensors: shape/offsets mismatch for tensor "${name}"`);
    }

    // Copy binary F32 values into a typed array used by the math in nn.js.
    const data = new Float32Array(numel);
    for (let i = 0; i < numel; i++) data[i] = dataBuf.readFloatLE(begin + i * 4);
    tensors[name] = { data, shape: info.shape };
  }
  return { tensors, metadata };
}

/**
 * Save atomically.
 *
 * The complete new model is written to a temporary file first. Rename then
 * replaces the old model in one filesystem operation, so a failed write does
 * not leave inference with a half-written model.
 */
function save(filePath, tensors, metadata = {}) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, serialize(tensors, metadata));
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

/** Read a complete project model and deserialize it for inference or training. */
function load(filePath) {
  return deserialize(fs.readFileSync(filePath));
}

module.exports = { serialize, deserialize, save, load };
