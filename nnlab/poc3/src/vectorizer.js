'use strict';
/**
 * AI STUDY GUIDE: TEXT VECTORIZATION
 * ==================================
 *
 * 1) FUNCTIONALITY
 *    Neural-network math works with numbers, not JavaScript strings. This
 *    module builds a vocabulary, converts characters to integer token IDs,
 *    creates next-character training examples, and encodes inference prompts.
 *
 * 2) WHY CHARACTER TOKENS?
 *    Character tokenization is simple and has no external dependency. It can
 *    represent any character found in the training data. The trade-off is that
 *    sequences are longer than word or subword token sequences, so this model
 *    learns spelling and local patterns more easily than deep meaning.
 *
 * 3) AI LEARNING / INFERENCE BACKGROUND
 *    Training and inference must share exactly the same vocabulary:
 *
 *      character "A" <-> token ID 17
 *
 *    During learning, each example contains numeric context tokens and one
 *    correct target token. During inference, the prompt becomes the same kind
 *    of context. A different token mapping would make learned weights refer to
 *    the wrong characters.
 */
const fs = require('fs');

/**
 * Read non-empty text lines with a fixed maximum.
 *
 * Even sampling is used instead of simply keeping the beginning, because the
 * end of a large document may contain different and useful patterns.
 */
function readLines(filePath, maxLines = 2000) {
  const text = fs.readFileSync(filePath, 'utf8');
  let lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > maxLines) {
    // Evenly sample to keep the corpus representative but bounded.
    const sampled = [];
    const step = lines.length / maxLines;
    for (let i = 0; i < maxLines; i++) sampled.push(lines[Math.floor(i * step)]);
    lines = sampled;
  }
  return lines;
}

/**
 * Build a deterministic character vocabulary.
 *
 * A Set removes duplicates. Sorting by Unicode code point ensures that two
 * fresh training runs on the same characters assign the same token IDs.
 */
function buildVocab(lines) {
  const set = new Set();
  for (const line of lines) for (const ch of line) set.add(ch);
  const chars = Array.from(set).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const charToIndex = new Map(chars.map((c, i) => [c, i]));
  return { chars, charToIndex, size: chars.length };
}

/**
 * Rebuild fast lookup structures from the ordered character list stored in
 * model.safetensors. The order is preserved because it defines token IDs.
 */
function vocabFromChars(chars) {
  const charToIndex = new Map(chars.map((c, i) => [c, i]));
  return { chars: chars.slice(), charToIndex, size: chars.length };
}

/**
 * Turn a document into causal next-character examples. Newlines are explicit
 * tokens and also pad the beginning of each line, so the model learns where a
 * new sentence starts and ends.
 *
 * For a short context of two characters, "cat" creates questions similar to:
 *
 *   [start, start] -> "c"
 *   [start, "c"]   -> "a"
 *   ["c", "a"]     -> "t"
 *   ["a", "t"]     -> newline
 *
 * Each copied context is an independent supervised-learning input.
 */
function buildCausalExamples(text, vocab, contextSize) {
  const newline = vocab.charToIndex.get('\n');
  if (newline === undefined) throw new Error('vocabulary must contain a newline token');

  const examples = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.length > 0);
  for (const line of lines) {
    // Newline padding represents "no earlier character in this line".
    const context = new Int32Array(contextSize).fill(newline);
    for (const ch of `${line}\n`) {
      const target = vocab.charToIndex.get(ch);
      if (target === undefined) continue;
      examples.push({ context: context.slice(), target });

      // Slide the fixed-size context window left and append the known target.
      // During training the real next character is used ("teacher forcing").
      context.copyWithin(0, 1);
      context[contextSize - 1] = target;
    }
  }
  return examples;
}

/**
 * Convert an inference prompt into the same context format used in training.
 *
 * Only the newest `contextSize` characters can influence this model. Unknown
 * prompt characters are skipped because no trained token ID exists for them.
 */
function encodeContext(prompt, vocab, contextSize) {
  const newline = vocab.charToIndex.get('\n') ?? 0;
  const context = new Int32Array(contextSize).fill(newline);
  for (const ch of prompt.slice(-contextSize)) {
    const token = vocab.charToIndex.get(ch);
    if (token === undefined) continue;
    context.copyWithin(0, 1);
    context[contextSize - 1] = token;
  }
  return context;
}

/**
 * LEGACY AUTOENCODER SUPPORT
 *
 * Encode a line into a Float32Array of length maxLen.
 * Values are charIndex / vocabSize (normalized to [0,1)); zero padding marks
 * "no character". Lines longer than maxLen are truncated.
 *
 * The active causal model does not use this representation. It remains here so
 * the original autoencoder study code can still be read and used.
 */
function encodeLine(line, vocab, maxLen) {
  const out = new Float32Array(maxLen);
  const n = Math.min(line.length, maxLen);
  for (let i = 0; i < n; i++) {
    const idx = vocab.charToIndex.get(line[i]);
    out[i] = idx === undefined ? 0 : idx / vocab.size;
  }
  return out;
}

/**
 * Decode the legacy autoencoder's continuous output by choosing the nearest
 * vocabulary index for every position.
 */
function decodeVector(vec, vocab) {
  let s = '';
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    if (v <= 0) continue; // padding / empty slot
    let idx = Math.round(v * vocab.size);
    if (idx < 0) idx = 0;
    if (idx >= vocab.size) idx = vocab.size - 1;
    s += vocab.chars[idx];
  }
  return s;
}

module.exports = {
  readLines,
  buildVocab,
  vocabFromChars,
  buildCausalExamples,
  encodeContext,
  encodeLine,
  decodeVector,
};
