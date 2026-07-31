'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const safetensors = require('../src/safetensors');
const { CausalLanguageModel, mulberry32 } = require('../src/nn');
const { buildVocab, buildCausalExamples, encodeContext } = require('../src/vectorizer');

test('safetensors round-trip preserves model parameters and metadata', () => {
  const model = new CausalLanguageModel(5, 3, 7, 64);
  model.weights[17] = 1.25;
  model.bias[2] = -0.5;
  const tensors = model.toTensors();
  tensors.vocab_codepoints = {
    data: Float32Array.from([10, 32, 97, 98, 99]),
    shape: [5],
  };

  const decoded = safetensors.deserialize(
    safetensors.serialize(tensors, { model_type: 'causal-char-softmax' })
  );
  const restored = CausalLanguageModel.fromTensors(decoded.tensors);

  assert.equal(decoded.metadata.model_type, 'causal-char-softmax');
  assert.equal(restored.contextSize, 3);
  assert.equal(restored.bucketCount, 64);
  assert.equal(restored.weights[17], 1.25);
  assert.equal(restored.bias[2], -0.5);
});

test('causal training reduces cross-entropy and produces a valid distribution', () => {
  const text = 'hello world\nhello neural network';
  const lines = text.split('\n');
  const vocab = buildVocab([...lines, '\n']);
  const examples = buildCausalExamples(text, vocab, 5);
  const model = new CausalLanguageModel(vocab.size, 5, 3, 128);
  const history = model.train(examples, { epochs: 10, learningRate: 0.12, seed: 3 });

  assert.ok(history.at(-1).loss < history[0].loss);
  const probs = model.probabilities(encodeContext('hello ', vocab, 5));
  const sum = probs.reduce((total, probability) => total + probability, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(probs.every((probability) => probability >= 0 && probability <= 1));
});

test('sampling is deterministic for the same seed', () => {
  const model = new CausalLanguageModel(4, 2, 1, 64);
  const context = Int32Array.from([0, 1]);
  const first = model.sample(context, { random: mulberry32(99), topK: 4 });
  const second = model.sample(context, { random: mulberry32(99), topK: 4 });
  assert.equal(first.token, second.token);
  assert.equal(first.probability, second.probability);
});

test('vocabulary expansion preserves all existing parameters and token ids', () => {
  const model = new CausalLanguageModel(4, 3, 1, 64);
  model.bias.set([0.1, 0.2, 0.3, 0.4]);
  model.weights[0] = 1.5;
  model.weights[3] = -2;
  model.weights[4] = 0.75;

  const expanded = model.expandVocabulary(6);

  assert.equal(expanded.vocabSize, 6);
  assert.deepEqual(Array.from(expanded.bias.slice(0, 4)), Array.from(model.bias));
  assert.equal(expanded.weights[0], 1.5);
  assert.equal(expanded.weights[3], -2);
  assert.equal(expanded.weights[6], 0.75);
  assert.ok(expanded.bias[4] < model.bias[0]);
  assert.ok(expanded.bias[5] < model.bias[0]);
  assert.equal(expanded.weights[4], 0);
  assert.equal(expanded.weights[5], 0);
});
