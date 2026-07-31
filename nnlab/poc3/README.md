# EoF Neural Network Lab: PoC 3

This experiment implements a small generative character model entirely in Node.js. It trains a causal next-character predictor, stores its learned parameters in Safetensors, generates text from the command line, and serves a local browser visualization.

No npm dependencies are required. Node.js 18 or newer is sufficient.

## Checkout state

The repository contains the source, tests, `datasets/english.txt`, `vocab.json`, and a historical `train_output.json`. Generated `model.safetensors` and the default `dataset.txt` are not currently checked in.

Create a fresh local model before running inference or the browser UI:

```bash
cd nnlab/poc3
node train.js datasets/english.txt --fresh
node infer.js --prompt "The "
npm start
```

The server listens on [http://127.0.0.1:3000](http://127.0.0.1:3000) by default. Use `HOST` and `PORT` environment variables to change the binding.

`npm run train` without arguments expects `dataset.txt`; it will fail until that file exists. The browser's training endpoint also uses `dataset.txt`, so copy or create a local dataset alias if UI-triggered retraining is needed:

```bash
cp datasets/english.txt dataset.txt
```

`dataset.txt`, `model.safetensors`, and generated archive/mix files are working artifacts. Decide explicitly whether they should be versioned before committing them.

## Commands

```bash
npm run train                         # train from dataset.txt
npm run infer                         # generate with defaults
npm run dump -- --values 4            # inspect model.safetensors
npm start                             # serve the browser UI
npm test                              # run the Node test suite
```

Direct CLI use provides more control:

```bash
node train.js datasets/english.txt --fresh --epochs 50 --context 16
node train.js new-corpus.txt --epochs 35 --learning-rate 0.12 --seed 42
node infer.js --prompt "Reading " --length 220 --temperature 0.55 --top-k 6
```

## Training

`train.js` reads at most 2,000 non-empty lines and turns them into causal `context -> next character` examples. It writes progress events to stderr, a JSON report to stdout and `train_output.json`, and the learned model to `model.safetensors`.

Defaults and limits:

| Option | Default | Accepted values |
|---|---:|---|
| input file | `dataset.txt` | first positional path |
| `--epochs` | 50 | integer 1–500 |
| `--context` | existing model value, or 16 for a fresh model | integer 2–64 |
| `--learning-rate` | 0.075 | greater than 0 and at most 1 |
| `--seed` | 42 | integer |
| `--fresh` | off | start without existing weights |
| `--quiet` | off | suppress progress events |

Without `--fresh`, training loads the existing `model.safetensors` and continues from its weights. If the new corpus contains unknown characters, the vocabulary and tensors expand while preserving existing token IDs and parameters. Supplying a different context size for an existing model is rejected; omit `--context` to keep the architecture or use `--fresh` to replace it.

Safetensors is not appendable. Training serializes a complete replacement to a temporary file and atomically renames it only after successful completion, so the previous model remains available if serialization fails.

## Model artifact

`model.safetensors` contains:

- trainable feature weights and output bias
- ordered character vocabulary
- architecture and training metadata

It does not contain a copy of the training corpus. `vocab.json` is also emitted as a human-readable vocabulary artifact, but inference restores the vocabulary and architecture from the Safetensors metadata.

The architecture activates hashed one-hot features for suffixes of the current context:

```text
character context
  -> hashed 1..N-gram features
  -> trainable weight matrix and bias
  -> softmax probability distribution
  -> sampled next character
```

Training minimizes cross-entropy with stochastic gradient descent and a decaying learning rate. This compact design is educational; it is not intended to compete with a Transformer language model.

## Inference

```bash
node infer.js --prompt "The " --length 220 --temperature 0.55 --top-k 6
node infer.js --prompt "Reading " --seed 12
node infer.js --prompt "A " --multiline --json
```

Inference defaults:

| Option | Default | Meaning |
|---|---:|---|
| `--prompt` | `The ` | initial context |
| `--length` | 180 | maximum generated characters |
| `--temperature` | 0.55 | sampling randomness |
| `--top-k` | 6 | retained candidates per step |
| `--seed` | 42 | deterministic pseudo-random seed |
| `--multiline` | off | continue after a generated newline |
| `--json` | off | emit machine-readable generation and trace data |

Lower temperature favors likely continuations; higher temperature increases variation. Matching model, prompt, options, and seed produces reproducible sampling.

## Browser UI and API

`server.js` serves static files from `public/` and provides:

- `GET /api/model`: current model metadata
- `POST /api/generate`: generate text and probability traces
- `POST /api/train`: start one background training run using `dataset.txt`
- `GET /api/train/status`: poll the active/last training state

The UI changes prompt, output length, temperature, Top-K, and seed. Its token radar shows the five most likely predictions for the most recently generated character. The server is designed for local use and has no authentication; do not expose it to an untrusted network.

## Versioned datasets and replay

`agent_dataset_builder.js` accepts JSON on stdin, reads explicitly declared website/file/directory resources, normalizes and deduplicates their lines, archives the new dataset, and creates a deterministic current-plus-history mix.

It requires an existing `model.safetensors` because its workflow is continuation training. By default, 60% of the mix is current data and 40% is historical replay, with at most 2,000 lines.

Generated layout:

```text
datasets/
├── archive/
│   ├── dataset_000001.txt
│   └── dataset_000001.manifest.json
├── mixed/
│   ├── training_mix_000001.txt
│   └── training_mix_000001.manifest.json
└── latest.json
```

Example:

```bash
printf '%s' '{
  "datasetResources": [
    {"type": "file", "value": "/absolute/path/new-data.txt"}
  ],
  "projectDirectory": "/absolute/path/to/MCPStudio_ToolSDK/nnlab/poc3",
  "datasetDirectory": "/absolute/path/to/MCPStudio_ToolSDK/nnlab/poc3/datasets",
  "newDataRatio": 0.6,
  "epochs": 35,
  "learningRate": 0.12,
  "seed": 42
}' | node agent_dataset_builder.js
```

The result's `scriptArguments` starts with the numbered mixed-dataset path followed by the training options. `adk_training_dataset.txt` is maintained as a compatibility alias, but the workflow should use the numbered path.

## Safetensors inspection

```bash
./dump_safetensors.sh
./dump_safetensors.sh model.safetensors --values 16
./dump_safetensors.sh /path/to/model-directory --no-stats
./dump_safetensors.sh --json --values 0
./dump_safetensors.sh --help
```

The dumper accepts one file or a directory of shards. For sharded models it reads `model.safetensors.index.json`, summarizes the set, and checks tensor-to-shard placement.

Files larger than 256 MiB are read by offset rather than loaded into one buffer. Full tensor statistics and SHA-256 are skipped by default for those files; use `--stats` and `--sha256` to force the scans.

## Tests

```bash
npm test
```

The tests use temporary fixtures and do not require the repository's generated model. They cover:

- Safetensors serialization/deserialization
- decreasing training loss
- normalized model probabilities
- deterministic generation
- lossless vocabulary expansion
- versioned dataset replay behavior

## Limitations

- Character tokens make long-range structure expensive.
- The hashed linear feature model has no attention or recurrent state.
- Training is CPU-only JavaScript and capped at 2,000 lines per run.
- The local server has no authentication or multi-user isolation.
- Quality depends strongly on the local dataset and generated model, neither of which is guaranteed by the checkout.
