'use strict';
/**
 * AI STUDY GUIDE: NEURAL-NETWORK MATH
 * ====================================
 *
 * 1) FUNCTIONALITY
 *    This module contains the mathematical models. Autoencoder is the original
 *    reconstruction experiment. CausalLanguageModel is the active generative
 *    model used by train.js and infer.js.
 *
 * 2) WHY THIS ALGORITHM?
 *    The active model is a compact next-character classifier:
 *
 *      recent characters -> hashed n-gram features -> weighted scores
 *                        -> softmax probabilities for the next character
 *
 *    It is much smaller and easier to inspect than a Transformer. Feature
 *    hashing allows it to remember multi-character patterns without creating a
 *    huge dictionary of every possible text fragment. This makes it suitable
 *    for an educational, dependency-free Node.js project.
 *
 * 3) AI LEARNING / INFERENCE BACKGROUND
 *    A trainable parameter is simply a number (a weight or bias). Training
 *    changes these numbers so the correct next character receives a higher
 *    probability. Inference keeps the numbers fixed and uses the probabilities
 *    to sample text.
 *
 *    This model demonstrates the core ideas of language modelling, but it is
 *    not a large language model. It has no attention layers and only uses a
 *    short local character context.
 */

/**
 * Small deterministic pseudo-random number generator (PRNG).
 *
 * Computers usually generate predictable "random-looking" sequences from a
 * seed. Reusing a seed repeats the same shuffle and sampling decisions, which
 * makes AI experiments reproducible.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Activation functions used by the legacy Autoencoder.
 *
 * An activation function adds non-linearity. Without it, many stacked layers
 * would behave like one linear calculation. `df` is the derivative used by
 * backpropagation to measure how a small input change affects the output.
 */
const ACTIVATIONS = {
  tanh: {
    f: (x) => Math.tanh(x),
    df: (a) => 1 - a * a, // derivative w.r.t. pre-activation, given activation
  },
  sigmoid: {
    f: (x) => 1 / (1 + Math.exp(-x)),
    df: (a) => a * (1 - a),
  },
};

/**
 * LEGACY STUDY MODEL: AUTOENCODER
 * ===============================
 *
 * Functionality:
 *   Compress an input vector into a smaller latent vector and reconstruct the
 *   original vector.
 *
 * Why it exists:
 *   Autoencoders are a clear introduction to dense layers, activations,
 *   backpropagation, and bottleneck representations.
 *
 * Why it is not the active generator:
 *   Reconstructing an existing line is different from predicting a new next
 *   character. The CausalLanguageModel below matches generative inference more
 *   directly.
 */
class Autoencoder {
  /**
   * Create dense layers and initialize their trainable values.
   *
   * A weight connects one input value to one output value. A bias is an
   * adjustable baseline added to an output before activation.
   *
   * @param {number[]} sizes     layer sizes, e.g. [128, 32, 16, 32, 128]
   * @param {string[]} acts      activation per layer transition, e.g. ['tanh','tanh','tanh','sigmoid']
   * @param {number}   seed      PRNG seed for deterministic init
   */
  constructor(sizes, acts, seed = 42) {
    if (acts.length !== sizes.length - 1) throw new Error('acts must match sizes-1');
    this.sizes = sizes;
    this.acts = acts;
    this.weights = [];
    this.biases = [];
    const rand = mulberry32(seed);
    for (let l = 0; l < sizes.length - 1; l++) {
      const fanIn = sizes[l], fanOut = sizes[l + 1];

      // Xavier initialization keeps early signals from becoming extremely
      // large or tiny as they pass through several layers.
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      const W = new Float32Array(fanOut * fanIn);
      for (let i = 0; i < W.length; i++) W[i] = (rand() * 2 - 1) * limit;
      this.weights.push(W);
      this.biases.push(new Float32Array(fanOut));
    }
  }

  /**
   * Forward pass: move information from input to output.
   *
   * Every neuron calculates:
   *   weighted sum = bias + sum(weight * previous value)
   *   output       = activation(weighted sum)
   *
   * Intermediate activations are returned because backpropagation needs them.
   */
  forward(x) {
    const activations = [x];
    for (let l = 0; l < this.weights.length; l++) {
      const prev = activations[l];
      const fanIn = this.sizes[l], fanOut = this.sizes[l + 1];
      const W = this.weights[l], b = this.biases[l];
      const act = ACTIVATIONS[this.acts[l]];
      const out = new Float32Array(fanOut);
      for (let o = 0; o < fanOut; o++) {
        let sum = b[o];
        const base = o * fanIn;
        for (let i = 0; i < fanIn; i++) sum += W[base + i] * prev[i];
        out[o] = act.f(sum);
      }
      activations.push(out);
    }
    return activations; // [input, h1, ..., output]
  }

  /**
   * Measure reconstruction error with Mean Squared Error (MSE).
   *
   * Squaring makes positive and negative mistakes both count and gives larger
   * mistakes more importance. Lower MSE means closer reconstruction.
   */
  mse(X) {
    let total = 0;
    for (const x of X) {
      const out = this.forward(x)[this.weights.length];
      for (let i = 0; i < x.length; i++) {
        const d = out[i] - x[i];
        total += d * d;
      }
    }
    return total / (X.length * this.sizes[0]);
  }

  /**
   * Learn reconstruction with full-batch gradient descent and momentum.
   *
   * Backpropagation applies the chain rule from the output layer backwards. It
   * calculates how much every parameter contributed to the error. Momentum
   * remembers part of the previous update and can smooth noisy movement.
   *
   * @returns {{epoch:number, loss:number}[]} loss history
   */
  train(X, epochs, learningRate, momentum = 0.9,
        logEvery = Math.max(1, Math.floor(epochs / 20))) {
    const L = this.weights.length;
    const nSamples = X.length;
    const outSize = this.sizes[this.sizes.length - 1];
    const history = [];

    // Gradients accumulate the suggested change for each parameter.
    const gW = this.weights.map((W) => new Float32Array(W.length));
    const gB = this.biases.map((b) => new Float32Array(b.length));

    // Velocity stores the momentum from earlier updates.
    const vW = this.weights.map((W) => new Float32Array(W.length));
    const vB = this.biases.map((b) => new Float32Array(b.length));

    for (let epoch = 0; epoch < epochs; epoch++) {
      gW.forEach((g) => g.fill(0));
      gB.forEach((g) => g.fill(0));
      let loss = 0;

      for (const x of X) {
        const acts = this.forward(x);
        const out = acts[L];

        // Output delta: how strongly each final output affected MSE.
        // In calculus notation: d(MSE)/dz.
        const outAct = ACTIVATIONS[this.acts[L - 1]];
        let delta = new Float32Array(outSize);
        for (let i = 0; i < outSize; i++) {
          const d = out[i] - x[i];
          loss += d * d;
          delta[i] = (2 * d / outSize) * outAct.df(out[i]);
        }

        // Move the error signal backwards through all dense layers.
        for (let l = L - 1; l >= 0; l--) {
          const prev = acts[l];
          const fanIn = this.sizes[l], fanOut = this.sizes[l + 1];
          const W = this.weights[l];
          for (let o = 0; o < fanOut; o++) {
            gB[l][o] += delta[o];
            const base = o * fanIn;
            for (let i = 0; i < fanIn; i++) gW[l][base + i] += delta[o] * prev[i];
          }
          if (l > 0) {
            const prevAct = ACTIVATIONS[this.acts[l - 1]];
            const nextDelta = new Float32Array(fanIn);
            for (let i = 0; i < fanIn; i++) {
              let sum = 0;
              for (let o = 0; o < fanOut; o++) sum += W[o * fanIn + i] * delta[o];
              nextDelta[i] = sum * prevAct.df(prev[i]);
            }
            delta = nextDelta;
          }
        }
      }

      // Apply averaged gradients:
      //   velocity  = momentum * old velocity - learning rate * gradient
      //   parameter = parameter + velocity
      const scale = learningRate / nSamples;
      for (let l = 0; l < L; l++) {
        const W = this.weights[l], b = this.biases[l];
        const vwl = vW[l], vbl = vB[l];
        for (let i = 0; i < W.length; i++) {
          vwl[i] = momentum * vwl[i] - scale * gW[l][i];
          W[i] += vwl[i];
        }
        for (let i = 0; i < b.length; i++) {
          vbl[i] = momentum * vbl[i] - scale * gB[l][i];
          b[i] += vbl[i];
        }
      }

      if (epoch % logEvery === 0 || epoch === epochs - 1) {
        history.push({ epoch, loss: loss / (nSamples * outSize) });
      }
    }
    return history;
  }

  /** Count all weights and biases that learning is allowed to change. */
  paramCount() {
    let n = 0;
    for (const W of this.weights) n += W.length;
    for (const b of this.biases) n += b.length;
    return n;
  }

  /** Convert weights and biases into named tensors for persistent storage. */
  toTensors() {
    const tensors = {};
    for (let l = 0; l < this.weights.length; l++) {
      tensors[`W${l + 1}`] = { data: this.weights[l], shape: [this.sizes[l + 1], this.sizes[l]] };
      tensors[`b${l + 1}`] = { data: this.biases[l], shape: [this.sizes[l + 1]] };
    }
    return tensors;
  }

  /** Restore the legacy Autoencoder from tensors read from Safetensors. */
  static fromTensors(tensors, sizes, acts) {
    const net = new Autoencoder(sizes, acts, 0);
    for (let l = 0; l < sizes.length - 1; l++) {
      net.weights[l] = tensors[`W${l + 1}`].data;
      net.biases[l] = tensors[`b${l + 1}`].data;
    }
    return net;
  }
}

/**
 * ACTIVE STUDY MODEL: CAUSAL CHARACTER LANGUAGE MODEL
 * ===================================================
 *
 * Functionality:
 *   Predict a probability for every possible next character.
 *
 * Algorithm:
 *   The input activates one feature for each suffix length. If the context ends
 *   with "cat", examples include the 1-gram "t", 2-gram "at", and 3-gram
 *   "cat". A hash maps each suffix to a fixed bucket. Every active bucket has a
 *   learned connection to every possible output character.
 *
 * Why use short and long suffixes together?
 *   A long suffix is specific but may be rare. A short suffix occurs often but
 *   is less precise. Combining them creates a simple back-off language model:
 *   use detailed patterns when known and general patterns when necessary.
 *
 * Weight layout: [ngramOrder, hashBucket, outputToken].
 */
class CausalLanguageModel {
  /**
   * Allocate model parameters.
   *
   * Float32Array is compact and matches the F32 Safetensors representation.
   * Weights begin at zero so unseen hash buckets add no random noise.
   */
  constructor(vocabSize, contextSize = 16, seed = 42, bucketCount = 4096) {
    if (!Number.isInteger(vocabSize) || vocabSize < 2) {
      throw new Error('vocabSize must be an integer >= 2');
    }
    if (!Number.isInteger(contextSize) || contextSize < 1) {
      throw new Error('contextSize must be an integer >= 1');
    }
    if (!Number.isInteger(bucketCount) || bucketCount < 64) {
      throw new Error('bucketCount must be an integer >= 64');
    }

    this.vocabSize = vocabSize;
    this.contextSize = contextSize;
    this.bucketCount = bucketCount;
    this.weights = new Float32Array(contextSize * bucketCount * vocabSize);
    this.bias = new Float32Array(vocabSize);
    // The seed is accepted for a stable public constructor. The training method
    // uses it for deterministic example shuffling.
    void seed;
  }

  /**
   * Convert a character suffix to a fixed bucket number.
   *
   * Storing every possible n-gram string would require a growing dictionary.
   * Feature hashing uses fixed memory instead. Different strings can rarely
   * share a bucket (a collision), which is the trade-off for compact storage.
   */
  featureBucket(context, order) {
    let hash = 2166136261;
    for (let i = context.length - order; i < context.length; i++) {
      hash ^= context[i] + 1;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % this.bucketCount;
  }

  /**
   * Give longer, more specific suffixes slightly more influence.
   *
   * Division by sqrt(contextSize) keeps the combined score scale manageable
   * when many suffix features are active at once.
   */
  featureScale(order) {
    // Short suffixes provide fluent back-off probabilities; longer suffixes
    // receive progressively more influence when an exact context was learned.
    return (1 + order / this.contextSize) / Math.sqrt(this.contextSize);
  }

  /**
   * Calculate one raw score (a "logit") for every possible next token.
   *
   * A logit is not yet a probability. Positive learned weights raise a token's
   * score for matching contexts; negative weights lower it.
   */
  logits(context) {
    if (context.length !== this.contextSize) {
      throw new Error(`context must contain exactly ${this.contextSize} tokens`);
    }

    const V = this.vocabSize;
    // Bias is the context-independent baseline score for each character.
    const out = Float64Array.from(this.bias);
    for (let i = 0; i < context.length; i++) {
      if (!Number.isInteger(context[i]) || context[i] < 0 || context[i] >= V) {
        throw new Error(`context token out of range at position ${i}: ${context[i]}`);
      }
    }

    // Add learned evidence from every suffix length.
    for (let order = 1; order <= this.contextSize; order++) {
      const bucket = this.featureBucket(context, order);
      const base = ((order - 1) * this.bucketCount + bucket) * V;
      const scale = this.featureScale(order);
      for (let y = 0; y < V; y++) out[y] += this.weights[base + y] * scale;
    }
    return out;
  }

  /**
   * Convert logits into probabilities with softmax.
   *
   * Softmax exponentiates scores and normalizes them so all probabilities are
   * positive and sum to 1. Subtracting the maximum score prevents Math.exp
   * from overflowing for large values ("numerical stability").
   *
   * Temperature divides the logits before softmax:
   * - lower temperature creates a sharper, more confident distribution;
   * - higher temperature creates a flatter, more varied distribution.
   */
  static softmax(logits, temperature = 1) {
    const t = Math.max(0.05, Number(temperature) || 1);
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] / t);
    const probs = new Float64Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      probs[i] = Math.exp(logits[i] / t - max);
      sum += probs[i];
    }
    for (let i = 0; i < probs.length; i++) probs[i] /= sum;
    return probs;
  }

  /** Convenience method: context -> logits -> probabilities. */
  probabilities(context, temperature = 1) {
    return CausalLanguageModel.softmax(this.logits(context), temperature);
  }

  /**
   * Train the next-character model with online SGD.
   *
   * Online means parameters are updated after every example rather than after
   * collecting one giant batch. This is straightforward and memory-efficient
   * for a small educational model.
   *
   * Cross-entropy loss is -log(probability of the correct token). It strongly
   * penalizes a confident wrong answer and becomes small when the correct
   * answer receives high probability.
   *
   * For softmax plus cross-entropy, the output gradient has a useful simple
   * form:
   *
   *   error = predicted probability - correct one-hot value
   *
   * A one-hot target is 1 for the correct character and 0 for all others.
   *
   * @param {{context:Int32Array|number[], target:number}[]} examples
   * @param {object} options
   * @returns {{epoch:number, loss:number, perplexity:number, learningRate:number}[]}
   */
  train(examples, options = {}) {
    if (!Array.isArray(examples) || examples.length === 0) {
      throw new Error('training examples must not be empty');
    }

    const epochs = Math.max(1, Math.floor(options.epochs ?? 30));
    const initialLearningRate = Number(options.learningRate ?? 0.12);
    const seed = Math.floor(options.seed ?? 42);
    const onEpoch = typeof options.onEpoch === 'function' ? options.onEpoch : null;
    const V = this.vocabSize;
    const C = this.contextSize;
    const featureScales = Float64Array.from({ length: C }, (_, i) => this.featureScale(i + 1));
    const order = Int32Array.from({ length: examples.length }, (_, i) => i);
    const rand = mulberry32(seed);
    const history = [];

    if (options.initializeBias !== false) {
      // A unigram prior starts a fresh model with general character frequencies
      // already represented. Continued learning keeps the old learned bias.
      const counts = new Float64Array(V).fill(1);
      for (const example of examples) counts[example.target]++;
      const countTotal = counts.reduce((a, b) => a + b, 0);
      for (let y = 0; y < V; y++) this.bias[y] = Math.log(counts[y] / countTotal);
    }

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffling prevents the original document order from always controlling
      // the update sequence. Fisher-Yates gives every ordering equal chance.
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }

      // Decrease the learning rate over time. Large early steps learn quickly;
      // smaller later steps help the model settle instead of overshooting.
      const learningRate = initialLearningRate / (1 + epoch * 0.12);
      const biasRate = learningRate * 0.25;
      let loss = 0;

      for (let n = 0; n < order.length; n++) {
        const { context, target } = examples[order[n]];

        // FORWARD PASS: calculate current next-character probabilities.
        const probs = this.probabilities(context);

        // LOSS: measure how surprised the model was by the correct answer.
        loss -= Math.log(Math.max(probs[target], 1e-12));

        for (let y = 0; y < V; y++) {
          // BACKWARD PASS: softmax-cross-entropy gradient.
          const error = probs[y] - (y === target ? 1 : 0);

          // SGD UPDATE: subtract gradient to move toward lower loss.
          this.bias[y] -= biasRate * error;
          for (let order = 1; order <= C; order++) {
            const bucket = this.featureBucket(context, order);
            const index = ((order - 1) * this.bucketCount + bucket) * V + y;
            this.weights[index] -= learningRate * error * featureScales[order - 1];
          }
        }
      }

      // Perplexity is exp(loss). A value near 1 means the model is usually very
      // certain; larger values mean it is choosing among more plausible tokens.
      const meanLoss = loss / examples.length;
      const entry = {
        epoch: epoch + 1,
        loss: meanLoss,
        perplexity: Math.exp(Math.min(meanLoss, 20)),
        learningRate,
      };
      history.push(entry);
      if (onEpoch) onEpoch(entry);
    }
    return history;
  }

  /**
   * Sample one next token from the probability distribution.
   *
   * Always choosing the maximum would be deterministic but repetitive. Random
   * weighted sampling allows several plausible continuations. Top-K removes
   * very unlikely candidates first, then probabilities are renormalized over
   * the remaining candidates.
   */
  sample(context, options = {}) {
    const temperature = Math.max(0.05, Number(options.temperature ?? 0.85));
    const topK = Math.max(0, Math.floor(options.topK ?? 8));
    const random = options.random || Math.random;
    const probs = this.probabilities(context, temperature);
    const ranked = Array.from(probs, (probability, token) => ({ token, probability }))
      .sort((a, b) => b.probability - a.probability);
    const candidates = topK > 0 ? ranked.slice(0, Math.min(topK, ranked.length)) : ranked;
    const candidateTotal = candidates.reduce((sum, item) => sum + item.probability, 0);

    // Imagine all candidate probabilities placed next to each other on a line.
    // A random threshold lands inside one candidate's section.
    let threshold = random() * candidateTotal;
    let selected = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      threshold -= candidate.probability;
      if (threshold <= 0) {
        selected = candidate;
        break;
      }
    }
    return {
      token: selected.token,
      probability: selected.probability / candidateTotal,
      ranked,
    };
  }

  /** Convert trainable arrays to named tensors for model.safetensors. */
  toTensors() {
    return {
      output_bias: { data: this.bias, shape: [this.vocabSize] },
      ngram_weights: {
        data: this.weights,
        shape: [this.contextSize, this.bucketCount, this.vocabSize],
      },
    };
  }

  /** Count all trainable scalar values in the active model. */
  paramCount() {
    return this.weights.length + this.bias.length;
  }

  /**
   * Enlarge the output vocabulary for continuous learning.
   *
   * Existing token IDs must not move because old weights refer to those exact
   * IDs. Therefore new characters are appended. Every old feature/output
   * weight is copied to its matching location in the wider tensor.
   *
   * New output weights start at zero. Their biases start below known characters
   * so an unseen, untrained token is not accidentally predicted too often.
   */
  expandVocabulary(newVocabSize) {
    if (!Number.isInteger(newVocabSize) || newVocabSize < this.vocabSize) {
      throw new Error(`newVocabSize must be an integer >= ${this.vocabSize}`);
    }
    if (newVocabSize === this.vocabSize) return this;

    const expanded = new CausalLanguageModel(
      newVocabSize,
      this.contextSize,
      0,
      this.bucketCount
    );
    expanded.bias.set(this.bias);
    let minimumBias = Infinity;
    for (const value of this.bias) minimumBias = Math.min(minimumBias, value);
    expanded.bias.fill(minimumBias - 2, this.vocabSize);

    const oldV = this.vocabSize;
    const featureCount = this.contextSize * this.bucketCount;
    for (let feature = 0; feature < featureCount; feature++) {
      const oldBase = feature * oldV;
      const newBase = feature * newVocabSize;
      expanded.weights.set(this.weights.subarray(oldBase, oldBase + oldV), newBase);
    }
    return expanded;
  }

  /**
   * Restore the active model from named Safetensors arrays.
   *
   * Tensor shapes carry enough information to reconstruct context length,
   * number of hash buckets, and vocabulary size. Shape checks catch an
   * incompatible or damaged model before inference uses it.
   */
  static fromTensors(tensors) {
    const weights = tensors.ngram_weights;
    const bias = tensors.output_bias;
    if (!weights || !bias || weights.shape.length !== 3) {
      throw new Error('not a causal character language model');
    }
    const [contextSize, bucketCount, outputVocab] = weights.shape;
    if (bias.shape[0] !== outputVocab) {
      throw new Error('invalid causal language model tensor shapes');
    }
    const model = new CausalLanguageModel(outputVocab, contextSize, 0, bucketCount);
    model.weights = weights.data;
    model.bias = bias.data;
    return model;
  }
}

module.exports = { Autoencoder, CausalLanguageModel, mulberry32 };
