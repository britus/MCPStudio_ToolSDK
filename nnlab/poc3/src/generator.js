'use strict';

/**
 * AI STUDY GUIDE: SHARED GENERATION LOGIC
 * =======================================
 *
 * 1) FUNCTIONALITY
 *    This module connects the saved model file to inference applications. It
 *    restores a CausalLanguageModel and provides the character-by-character
 *    generation loop used by infer.js and the browser server.
 *
 * 2) WHY THIS ALGORITHM?
 *    Autoregressive generation matches the model's training objective. Training
 *    taught the model to predict one next character, so inference repeatedly
 *    calls that same prediction rather than trying to create a whole sentence
 *    in one operation.
 *
 * 3) AI INFERENCE BACKGROUND
 *    The trained weights are fixed during inference. A prompt is encoded into
 *    token IDs, the model calculates next-token probabilities, and sampling
 *    chooses one token. The selected token is fed back into the next context.
 *    This feedback loop is what turns a next-character predictor into a text
 *    generator.
 */
const path = require('path');
const safetensors = require('./safetensors');
const { CausalLanguageModel, mulberry32 } = require('./nn');
const { vocabFromChars, encodeContext } = require('./vectorizer');

/**
 * Restore everything required for inference from one Safetensors file.
 *
 * The vocabulary must be loaded together with the weights. If character "a"
 * had token ID 12 during training, it must still have ID 12 during inference.
 */
function loadGenerativeModel(modelPath = path.join(__dirname, '..', 'model.safetensors')) {
  // Safetensors returns named numeric arrays plus descriptive metadata.
  const { tensors, metadata } = safetensors.load(modelPath);

  // Reject another architecture early. Tensor files do not automatically tell
  // JavaScript which mathematical model should interpret their numbers.
  if (metadata.model_type !== 'causal-char-softmax') {
    throw new Error(
      `The model at ${modelPath} is a legacy ${metadata.framework || 'unknown'} model. ` +
      'Run "npm run train" once to create a generative model.'
    );
  }

  if (!tensors.vocab_codepoints) {
    throw new Error('model does not contain vocab_codepoints');
  }

  // Unicode code points are numbers such as 65 for "A". Convert them back to
  // characters, rebuild the lookup map, and restore the model object.
  const chars = Array.from(tensors.vocab_codepoints.data, (cp) =>
    String.fromCodePoint(Math.round(cp))
  );
  const vocab = vocabFromChars(chars);
  const model = CausalLanguageModel.fromTensors(tensors);
  if (model.vocabSize !== vocab.size) throw new Error('model/vocabulary size mismatch');
  return { model, vocab, metadata, modelPath };
}

/**
 * Generate new text and an explanation trace for visual applications.
 *
 * Temperature:
 *   < 1 makes common choices stronger and output more conservative.
 *   > 1 flattens probabilities and increases variety.
 *
 * Top-K:
 *   Restricts sampling to the K most likely characters. This reduces the
 *   chance of selecting an extremely unlikely character.
 */
function generateText(loaded, prompt = '', options = {}) {
  const { model, vocab } = loaded;

  // Clamp user values to safe ranges. This protects the server and also avoids
  // mathematical edge cases such as division by a zero temperature.
  const maxNewChars = Math.min(2000, Math.max(1, Math.floor(options.maxNewChars ?? 240)));
  const temperature = Math.min(2, Math.max(0.05, Number(options.temperature ?? 0.55)));
  const topK = Math.min(vocab.size, Math.max(0, Math.floor(options.topK ?? 6)));
  const seed = Math.floor(options.seed ?? 42);
  const stopAtNewline = Boolean(options.stopAtNewline);

  // A seeded pseudo-random generator gives the same output for the same model,
  // prompt, and settings. That is valuable when studying or debugging an AI.
  const random = mulberry32(seed);

  // Only the most recent `contextSize` tokens are needed by this architecture.
  const context = encodeContext(prompt, vocab, model.contextSize);
  const trace = [];
  let generated = '';

  // This is the autoregressive inference loop.
  for (let i = 0; i < maxNewChars; i++) {
    // 1. Predict and sample one next token.
    const sampled = model.sample(context, { temperature, topK, random });

    // 2. Convert the numeric token back to a visible character.
    const char = vocab.chars[sampled.token];
    generated += char;

    // 3. Keep a small explanation trace. The browser uses this to display the
    //    five most likely alternatives for the current generation step.
    trace.push({
      index: i,
      char,
      probability: sampled.probability,
      top: sampled.ranked.slice(0, 5).map((item) => ({
        char: vocab.chars[item.token],
        probability: item.probability,
      })),
    });

    // 4. Slide the context window left and append the new token. The generated
    //    output therefore influences every prediction that follows.
    context.copyWithin(0, 1);
    context[context.length - 1] = sampled.token;
    if (stopAtNewline && char === '\n') break;
  }

  return {
    prompt,
    generated,
    text: prompt + generated,
    settings: { maxNewChars, temperature, topK, seed, stopAtNewline },
    trace,
  };
}

module.exports = { loadGenerativeModel, generateText };
