# EoF Neural Network Lab - Implementation Report

## Result

The original reconstruction autoencoder was replaced with a causal, generative character model. Training and inference run in Node.js without external libraries. `model.safetensors` contains the weights, bias, vocabulary, and metadata, and can be loaded on its own for inference.

By default, subsequent training runs continue from the existing model. New characters expand the vocabulary and weight tensors without discarding existing token IDs or parameters. Only `--fresh` deliberately starts with a new model.

## Current Training Run

- Corpus: 213 non-empty lines from `dataset.txt`
- Context: 16 characters
- Vocabulary: 55 characters
- Trainable parameters: 3,604,535
- Training runs: 2
- Cumulative epochs: 36
- Cross-entropy of the first run: 2.7414 → 0.5152
- Cross-entropy after the subsequent training run: 0.5126
- Current perplexity: 1.67
- Safetensors size: approximately 14 MB

The figures are also written in machine-readable form to `train_output.json` on every run.

## Ways to Use It

1. `npm run train` loads the model, continues training, and atomically writes back the complete expanded file.
2. `npm run infer` displays a generated continuation directly in the terminal.
3. `npm start` starts the local visual interface.
4. The interface can initiate training, poll its progress, and display generative inference with an animated character sequence and Top-5 probabilities.

## Verification

- Safetensors serialization and deserialization are covered by a round-trip test.
- The training test requires cross-entropy to decrease.
- Softmax outputs are checked for a normalized distribution.
- Sampling with a fixed seed is checked for reproducibility.
- Vocabulary expansion is checked for complete preservation of the old weights.
- The CLI, model API, and browser assets were run locally.

## PoC Limitations

The model is small and trained on only approximately 12,000 characters. It learns recognizable words and sentence patterns but has no semantic world knowledge. Production-quality text would require a larger corpus, subword-level tokenization, and a Transformer or RNN architecture.
