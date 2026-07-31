'use strict';

/**
 * AI STUDY GUIDE: TRAINING
 * ========================
 *
 * 1) FUNCTIONALITY
 *    This program reads a text dataset, turns the text into many
 *    "previous characters -> next character" examples, trains the neural
 *    language model, and saves the learned numbers in model.safetensors.
 *    By default it continues an existing model. Use --fresh only when a new
 *    model should start without any previously learned weights.
 *
 * 2) WHY THIS ALGORITHM?
 *    A character-level causal model is small enough to implement in plain
 *    Node.js and easy to study. It does not need a tokenizer library: every
 *    character is a token. The model learns which character is likely to come
 *    next from up to `contextSize` earlier characters.
 *
 * 3) AI LEARNING BACKGROUND
 *    Training repeatedly follows this loop:
 *
 *      context -> model probabilities -> compare with correct next character
 *              -> calculate error -> adjust weights
 *
 *    The comparison uses cross-entropy loss. Stochastic gradient descent (SGD)
 *    changes the weights in the direction that lowers this loss. One complete
 *    pass over all examples is called an epoch. Lower loss and perplexity
 *    usually mean that the model predicts the training text more confidently.
 *
 *    Safetensors stores learned parameters, not human-readable knowledge.
 *    During inference, infer.js loads these parameters and uses them to
 *    generate new text one character at a time.
 *
 * Usage:
 *   node train.js [dataset.txt] [--epochs 50] [--learning-rate 0.075]
 *   node train.js dataset.txt --fresh [--context 16]
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { buildVocab, vocabFromChars, buildCausalExamples } = require('./src/vectorizer');
const { CausalLanguageModel } = require('./src/nn');
const safetensors = require('./src/safetensors');
const { loadGenerativeModel } = require('./src/generator');

const PROJECT_DIR = __dirname;

/**
 * Read command-line settings.
 *
 * Hyperparameters are values chosen before learning begins:
 * - epochs: how many times the model sees the complete dataset.
 * - learning rate: how large each weight update is.
 * - context: how many previous characters the model can inspect.
 * - seed: makes shuffling and sampling reproducible for study and testing.
 */
function parseArgs(argv) {
  const options = {
    inputFile: 'dataset.txt',
    epochs: 50,
    contextSize: null,
    learningRate: 0.075,
    seed: 42,
    quiet: false,
    fresh: false,
  };
  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextValue = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value after ${arg}`);
      return argv[++i];
    };
    if (arg === '--epochs') options.epochs = Number(nextValue());
    else if (arg.startsWith('--epochs=')) options.epochs = Number(arg.split('=')[1]);
    else if (arg === '--context') options.contextSize = Number(nextValue());
    else if (arg.startsWith('--context=')) options.contextSize = Number(arg.split('=')[1]);
    else if (arg === '--learning-rate') options.learningRate = Number(nextValue());
    else if (arg.startsWith('--learning-rate=')) options.learningRate = Number(arg.split('=')[1]);
    else if (arg === '--seed') options.seed = Number(nextValue());
    else if (arg.startsWith('--seed=')) options.seed = Number(arg.split('=')[1]);
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--fresh') options.fresh = true;
    else if (!arg.startsWith('-') && !positionalSeen) {
      options.inputFile = arg;
      positionalSeen = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  options.epochs = Math.floor(options.epochs);
  if (options.contextSize !== null) options.contextSize = Math.floor(options.contextSize);
  options.seed = Math.floor(options.seed);
  if (options.epochs < 1 || options.epochs > 500) throw new Error('epochs must be 1..500');
  if (options.contextSize !== null && (options.contextSize < 2 || options.contextSize > 64)) {
    throw new Error('context must be 2..64');
  }
  if (!(options.learningRate > 0 && options.learningRate <= 1)) {
    throw new Error('learning-rate must be > 0 and <= 1');
  }
  return options;
}

function trainModel(options) {
  const inputPath = path.resolve(options.inputFile);
  const modelPath = path.join(PROJECT_DIR, 'model.safetensors');
  if (!fs.existsSync(inputPath)) throw new Error(`input file not found: ${inputPath}`);

  // STEP 1: Read and clean the training corpus.
  //
  // The 2,000-line limit keeps this educational implementation fast and keeps
  // memory use predictable. The Dataset Builder therefore creates a replay
  // mix with the same maximum size.
  const startedAt = new Date();
  const startedMs = Date.now();
  const sourceText = fs.readFileSync(inputPath, 'utf8').replace(/\r\n?/g, '\n');
  const lines = sourceText.split('\n').filter((line) => line.length > 0).slice(0, 2000);
  if (lines.length === 0) throw new Error('input file contains no non-empty lines');

  // STEP 2: Build the vocabulary.
  //
  // A vocabulary maps every known character to an integer token ID. Newline
  // is a real token. Repeating it at the start of a line gives the model a
  // recognizable "start of sentence" context.
  const trainingText = lines.join('\n');
  const incomingVocab = buildVocab([...lines, '\n']);
  let vocab = incomingVocab;
  let model;
  let previous = null;
  let mode = 'fresh';
  let contextSize = options.contextSize ?? 16;

  // STEP 3: Either continue learning or create a new model.
  //
  // Continuous learning starts from old weights instead of random/zero
  // weights. If the new dataset contains unseen characters, the vocabulary
  // and output layer are enlarged while old token IDs and weights are kept.
  if (!options.fresh && fs.existsSync(modelPath)) {
    let loaded;
    try {
      loaded = loadGenerativeModel(modelPath);
    } catch (error) {
      throw new Error(`${error.message} Use --fresh to replace the incompatible model.`);
    }
    contextSize = options.contextSize ?? loaded.model.contextSize;
    if (contextSize !== loaded.model.contextSize) {
      throw new Error(
        `existing model uses context ${loaded.model.contextSize}; ` +
        'omit --context to continue it, or add --fresh to create a new architecture'
      );
    }

    const existingChars = new Set(loaded.vocab.chars);
    const addedChars = incomingVocab.chars.filter((char) => !existingChars.has(char));
    vocab = vocabFromChars([...loaded.vocab.chars, ...addedChars]);
    model = loaded.model.expandVocabulary(vocab.size);
    previous = {
      metadata: loaded.metadata,
      vocabSize: loaded.vocab.size,
      parameters: loaded.model.paramCount(),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex'),
      addedChars,
    };
    mode = 'continue';
  } else {
    model = new CausalLanguageModel(vocab.size, contextSize, options.seed);
  }

  // STEP 4: Create supervised learning examples.
  //
  // Example:
  //   text:    "cat"
  //   context: "ca"
  //   target:  "t"
  //
  // buildCausalExamples slides this question across every line. "Causal"
  // means the model only sees characters on the left, never the future target.
  const examples = buildCausalExamples(trainingText, vocab, contextSize);

  // STEP 5: Optimize the parameters.
  //
  // model.train performs prediction, cross-entropy calculation, and SGD weight
  // updates. A fresh model receives a simple character-frequency bias. A
  // continued model keeps its already learned bias.
  const history = model.train(examples, {
    epochs: options.epochs,
    learningRate: options.learningRate,
    seed: options.seed,
    initializeBias: mode === 'fresh',
    onEpoch(entry) {
      if (!options.quiet) {
        process.stderr.write(`PROGRESS ${JSON.stringify(entry)}\n`);
      }
    },
  });

  // STEP 6: Convert JavaScript arrays into named tensors.
  //
  // The vocabulary is stored as Unicode code points in the same file. This is
  // important: inference must use exactly the same token IDs as training.
  const tensors = model.toTensors();
  tensors.vocab_codepoints = {
    data: Float32Array.from(vocab.chars.map((char) => char.codePointAt(0))),
    shape: [vocab.size],
  };

  const first = history[0];
  const last = history[history.length - 1];

  // Training metadata makes the binary model auditable. It records where the
  // data came from and how the model was trained, but it does not copy the
  // complete training text into model.safetensors.
  const previousRuns = previous ? Number(previous.metadata.training_runs || 1) : 0;
  const previousEpochs = previous
    ? Number(previous.metadata.total_epochs || previous.metadata.epochs || 0)
    : 0;
  let trainingSources = [];
  if (previous) {
    try {
      trainingSources = JSON.parse(previous.metadata.training_sources || '[]');
    } catch {
      trainingSources = [];
    }
    if (trainingSources.length === 0 && previous.metadata.input_file) {
      trainingSources.push(previous.metadata.input_file);
    }
  }
  if (!trainingSources.includes(inputPath)) trainingSources.push(inputPath);

  const metadata = {
    format: 'safetensors',
    framework: 'node-scratch-neural-lm',
    model_type: 'causal-char-softmax',
    architecture: 'hashed-character-ngrams->softmax',
    context_size: String(contextSize),
    vocab_size: String(vocab.size),
    parameters: String(model.paramCount()),
    input_file: inputPath,
    input_sha256: crypto.createHash('sha256').update(trainingText).digest('hex'),
    training_sources: JSON.stringify(trainingSources),
    training_runs: String(previousRuns + 1),
    total_epochs: String(previousEpochs + options.epochs),
    last_run_mode: mode,
    vocab_added_last_run: String(previous ? previous.addedChars.length : vocab.size),
    created_at: previous?.metadata.created_at || previous?.metadata.trained_at || startedAt.toISOString(),
    trained_at: startedAt.toISOString(),
    epochs: String(options.epochs),
    learning_rate: String(options.learningRate),
    seed: String(options.seed),
    final_loss: String(last.loss),
    final_perplexity: String(last.perplexity),
  };
  if (previous) metadata.continued_from_sha256 = previous.sha256;

  // STEP 7: Save the learned model.
  //
  // safetensors.save writes a temporary file first and then renames it. The old
  // model therefore remains usable until the new file is complete.
  safetensors.save(modelPath, tensors, metadata);

  fs.writeFileSync(
    path.join(PROJECT_DIR, 'vocab.json'),
    `${JSON.stringify({ size: vocab.size, chars: vocab.chars }, null, 2)}\n`
  );

  return {
    phase: 'train',
    mode,
    inputFile: inputPath,
    corpus: {
      lines: lines.length,
      characters: trainingText.length,
      examples: examples.length,
      vocabSize: vocab.size,
    },
    architecture: {
      type: metadata.model_type,
      contextSize,
      vocabularySize: vocab.size,
      parameters: model.paramCount(),
      vocabularyAdded: previous ? previous.addedChars : vocab.chars,
    },
    hyperparameters: {
      epochs: options.epochs,
      learningRate: options.learningRate,
      seed: options.seed,
    },
    training: {
      run: previousRuns + 1,
      totalEpochs: previousEpochs + options.epochs,
      firstLoss: first.loss,
      finalLoss: last.loss,
      firstPerplexity: first.perplexity,
      finalPerplexity: last.perplexity,
      lossReductionPct: 100 * (first.loss - last.loss) / first.loss,
      durationMs: Date.now() - startedMs,
      history,
    },
    previousModel: previous ? {
      vocabSize: previous.vocabSize,
      parameters: previous.parameters,
      sha256: previous.sha256,
    } : null,
    artifacts: {
      model: modelPath,
      modelBytes: fs.statSync(modelPath).size,
      vocabulary: path.join(PROJECT_DIR, 'vocab.json'),
    },
  };
}

/**
 * CLI entry point.
 *
 * Human-readable progress goes to stderr. The final machine-readable JSON goes
 * to stdout and train_output.json so agents and shell scripts can consume it.
 */
function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = trainModel(options);
    const output = `${JSON.stringify(summary, null, 2)}\n`;
    fs.writeFileSync(path.join(PROJECT_DIR, 'train_output.json'), output);
    process.stdout.write(output);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseArgs, trainModel };
