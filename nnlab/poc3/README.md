# EoF Neural Network Lab

This project trains a small generative character model entirely in Node.js. The model learns to predict the next character from a given context. During inference, this prediction is sampled repeatedly, producing new text rather than merely reconstructing the input.

`model.safetensors` is the central model artifact. It contains:

- all trained network weights,
- the output bias,
- the complete character vocabulary,
- architecture and training metadata.

The raw text intentionally remains in `dataset.txt`; Safetensors contains the parameters learned from it, not a copy of the corpus.

## Quick Start

Node.js 18 or newer is required. No npm dependencies are needed.

```bash
npm run train
npm run infer
npm start
```

The visual interface is then available at [http://127.0.0.1:3000](http://127.0.0.1:3000). It lets you change the prompt, output length, temperature, Top-K, and random seed. The token radar shows the five most likely predictions for the most recently generated character.

## Training

```bash
node train.js dataset.txt
node train.js custom-corpus.txt --epochs 50 --learning-rate 0.1
node train.js dataset.txt --fresh --context 20
```

Without `--fresh`, every subsequent run is incremental: the existing `model.safetensors` is loaded, its weights are used as the starting point, and training then continues. If the new corpus contains previously unknown characters, they are appended to the existing vocabulary and the weight tensors are expanded accordingly. Existing token IDs and parameters are preserved.

Safetensors is not an appendable log format. Instead of appending bytes to the old file, the application builds a complete, expanded Safetensors file and then atomically replaces the old file with it. This keeps the previous model usable until the operation completes successfully.

Defaults:

| Option | Value | Description |
|---|---:|---|
| `--epochs` | 35 | complete training passes |
| `--context` | existing value or 16 | maximum number of preceding characters; configurable with `--fresh` |
| `--learning-rate` | 0.12 | initial SGD learning rate |
| `--seed` | 42 | reproducible ordering |
| `--fresh` | off | deliberately discard existing weights and start over |

Training writes its JSON report to stdout and to `train_output.json`; progress events are written to stderr. The new Safetensors file atomically replaces the previous model only after training completes successfully.

## Versioned Datasets and Historical Replay

`agent_dataset_builder.js` reads the explicitly provided resources, normalizes and deduplicates them, and stores every new dataset version as an immutable snapshot:

```text
datasets/
├── archive/
│   ├── dataset_000001.txt
│   ├── dataset_000001.manifest.json
│   ├── dataset_000002.txt
│   └── dataset_000002.manifest.json
├── mixed/
│   ├── training_mix_000002.txt
│   └── training_mix_000002.manifest.json
└── latest.json
```

By default, the mixed dataset contains 60% current data and 40% deterministically selected historical replay data. It is limited to 2,000 lines, matching the maximum input size of `train.js`. On the first run, an existing legacy `adk_training_dataset.txt` is migrated once as a historical dataset version.

The builder receives its configuration as JSON via stdin and returns the mixed dataset path as the first element of `scriptArguments`:

```bash
printf '%s' '{
  "datasetResources": [
    {"type": "file", "value": "/absolute/path/new-data.txt"}
  ],
  "projectDirectory": "${TOOLSDK}/nnlab/poc3",
  "datasetDirectory": "${TOOLSDK}/nnlab/poc3/datasets",
  "newDataRatio": 0.6,
  "epochs": 35,
  "learningRate": 0.12,
  "seed": 42
}' | node agent_dataset_builder.js
```

The “Continue Trainer” workflow agent passes these arguments unchanged to `train.js`. As a result, training always uses the numbered mixed dataset rather than only the most recently added raw dataset.

## Generative Inference

```bash
node infer.js --prompt "The " --length 220 --temperature 0.55 --top-k 6
node infer.js --prompt "Reading " --seed 12
node infer.js --prompt "A " --json
```

A lower temperature produces more conservative, stable continuations. A higher temperature increases variation as well as the risk of implausible character sequences. Output is reproducible when using the same seed and settings.

## Dumping a Safetensors File

The Node.js dumper is invoked through the shell script:

```bash
./dump_safetensors.sh
./dump_safetensors.sh model.safetensors --values 16
./dump_safetensors.sh /path/to/a-model.safetensors --no-stats
npm run dump -- --values 4
```

If no file is specified, the project's `model.safetensors` is used. The output includes the file size, SHA-256, header and data lengths, all metadata, and—for each tensor—its data type, shape, element count, byte range, minimum, maximum, mean, and a limited value preview.

A directory containing multiple shards can be passed directly. For the installed Gemma model:

```bash
./dump_safetensors.sh \
  /Users/eofmc/.lmstudio/models/lmstudio-community/gemma-4-26B-A4B-it-MLX-4bit \
  --values 4
```

The dumper automatically finds all three `model-0000x-of-00003.safetensors` files in the directory. It also evaluates `model.safetensors.index.json`, creates an overall summary, and checks whether each tensor resides in the expected shard.

For machine-readable output:

```bash
./dump_safetensors.sh --json
./dump_safetensors.sh --json --no-stats > model-dump.json
./dump_safetensors.sh \
  /Users/eofmc/.lmstudio/models/lmstudio-community/gemma-4-26B-A4B-it-MLX-4bit \
  --json --values 0 > gemma-model-dump.json
```

Files larger than 256 MiB are read using offsets and are never loaded in full into a Node.js buffer. Full tensor statistics and SHA-256 are skipped by default for such files because calculating them would require reading all approximately 15 GB. If needed, they can be explicitly enabled with `--stats` and `--sha256`, respectively.

All options:

```bash
./dump_safetensors.sh --help
```

## Architecture

The model activates a hashed one-hot feature for each suffix of the current character context. These features are fully connected to a softmax output over the vocabulary:

```text
Character context
   → hashed 1..N-gram features
   → trainable weight matrix
   → softmax distribution
   → next-character sampling
```

Cross-entropy is optimized using stochastic gradient descent with a decaying learning rate. The implementation is deliberately compact and avoids native ML dependencies so that training, persistence, and inference remain easy to understand.

## Tests

```bash
npm test
```

The tests cover Safetensors round-tripping, decreasing training loss, valid probability distributions, deterministic sampling, and lossless vocabulary expansion.
