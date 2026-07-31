# EoF Neural Network Lab: implementation status

## Current repository status

PoC 3 is implemented as a dependency-free causal character model in Node.js. Training, incremental vocabulary expansion, Safetensors persistence, deterministic generation, dataset replay, CLI inspection, a local web interface, and automated tests are present.

The generated `model.safetensors` and default `dataset.txt` were removed from the current checkout. Consequently:

- source-level tests can run immediately with `npm test`;
- inference and model inspection require a locally generated `model.safetensors`;
- `npm run train` and UI-triggered training require a local `dataset.txt`, unless training is invoked directly with another dataset path;
- `datasets/english.txt` can seed a fresh local model.

## Historical training snapshot

`train_output.json` is retained as the machine-readable record of the last captured run. It references working artifacts that are no longer present and should not be interpreted as proof that the current checkout is inference-ready.

Recorded values:

- Mode: continuation
- Input: `dataset.txt`
- Corpus: 2,000 non-empty lines, 19,864 characters
- Context size: 16
- Vocabulary: 29 characters
- Parameters: 1,900,573
- Run: 5
- Cumulative epochs: 250
- Run hyperparameters: 50 epochs, learning rate 0.075, seed 42
- Cross-entropy: 0.83137 to 0.80074
- Perplexity: 2.29647 to 2.22719
- Recorded duration: 13,701 ms
- Recorded model size: 7,603,526 bytes

Absolute paths in this historical JSON reflect the machine on which the run was captured. Consumers should resolve their own project and artifact paths instead of reusing them.

## Implemented components

| Component | Status |
|---|---|
| Causal hashed-suffix language model | implemented in `src/nn.js` |
| Vocabulary and causal-example construction | implemented in `src/vectorizer.js` |
| Safetensors read/write | implemented in `src/safetensors.js` |
| Model loading and autoregressive generation | implemented in `src/generator.js` |
| Fresh and continuation training CLI | implemented in `train.js` |
| Terminal/JSON inference CLI | implemented in `infer.js` |
| Versioned dataset archive and replay mix | implemented in `agent_dataset_builder.js` |
| Single/sharded Safetensors inspection | implemented in `dump_safetensors.js` |
| Local visualization and training API | implemented in `server.js` and `public/` |
| Automated tests | implemented under `test/` |

## Verification

Run from `nnlab/poc3`:

```bash
npm test
node train.js datasets/english.txt --fresh --epochs 1
node infer.js --prompt "The " --length 40 --seed 42 --json
./dump_safetensors.sh model.safetensors --values 4
npm start
```

The one-epoch training command is a smoke test and replaces/creates the local model because it uses `--fresh`. Use a copied working directory if an existing trained model must be preserved.

## Remaining limitations

The model is an educational linear next-character predictor, not a general-purpose language model. Its quality is bounded by the 2,000-line training cap, character-level tokenization, hashed features, and lack of attention or recurrence. The browser server is intended only for trusted local access and the checked-in historical metrics are not a reproducible benchmark without the original dataset/model artifacts.
