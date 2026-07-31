'use strict';

/**
 * AI STUDY GUIDE: GENERATIVE INFERENCE
 * ====================================
 *
 * 1) FUNCTIONALITY
 *    This program loads model.safetensors and generates a continuation for a
 *    prompt. It can print colored text for a person or JSON for another tool.
 *
 * 2) WHY THIS ALGORITHM?
 *    The model was trained to answer one small question:
 *    "Given the recent characters, which character probably comes next?"
 *    Generation simply asks this question repeatedly. Every selected character
 *    is appended to the context and becomes input for the next prediction.
 *
 * 3) AI INFERENCE BACKGROUND
 *    Inference means using learned weights without changing them. The model
 *    produces a probability distribution, not a complete sentence. Sampling
 *    selects one character from that distribution:
 *
 *      prompt -> probabilities -> sample one character -> extend prompt
 *             -> probabilities -> sample one character -> ...
 *
 *    Temperature controls randomness. Lower values prefer safe, likely
 *    characters; higher values create more variation. Top-K keeps only the K
 *    most likely choices before sampling. A fixed seed makes the random choices
 *    reproducible.
 *
 * Usage:
 *   node infer.js --prompt "The " --length 180 --temperature 0.55 --top-k 6
 *   node infer.js --prompt "A " --json
 */
const path = require('path');
const { loadGenerativeModel, generateText } = require('./src/generator');

/** Read generation controls from the command line. */
function parseArgs(argv) {
  const options = {
    prompt: 'The ',
    maxNewChars: 180,
    temperature: 0.55,
    topK: 6,
    seed: 42,
    stopAtNewline: true,
    json: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value after ${arg}`);
      return argv[++i];
    };
    if (arg === '--prompt') options.prompt = value();
    else if (arg.startsWith('--prompt=')) options.prompt = arg.slice('--prompt='.length);
    else if (arg === '--length') options.maxNewChars = Number(value());
    else if (arg.startsWith('--length=')) options.maxNewChars = Number(arg.split('=')[1]);
    else if (arg === '--temperature') options.temperature = Number(value());
    else if (arg.startsWith('--temperature=')) options.temperature = Number(arg.split('=')[1]);
    else if (arg === '--top-k') options.topK = Number(value());
    else if (arg.startsWith('--top-k=')) options.topK = Number(arg.split('=')[1]);
    else if (arg === '--seed') options.seed = Number(value());
    else if (arg.startsWith('--seed=')) options.seed = Number(arg.split('=')[1]);
    else if (arg === '--multiline') options.stopAtNewline = false;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-')) positional.push(arg);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (positional.length) options.prompt = positional.join(' ');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    // STEP 1: Restore architecture, weights, bias, vocabulary, and metadata
    // from the Safetensors file. No training happens in this process.
    const loaded = loadGenerativeModel(path.join(__dirname, 'model.safetensors'));

    // STEP 2: Run the autoregressive generation loop. `result.trace` also
    // contains the top predictions for each generated character.
    const result = generateText(loaded, options.prompt, options);

    // JSON mode is useful for tests, agents, APIs, and visual applications.
    if (options.json) {
      console.log(JSON.stringify({
        phase: 'generate',
        model: {
          path: loaded.modelPath,
          type: loaded.metadata.model_type,
          trainedAt: loaded.metadata.trained_at,
          contextSize: loaded.model.contextSize,
          vocabSize: loaded.vocab.size,
        },
        ...result,
      }, null, 2));
      return;
    }

    // Terminal mode visually separates the user prompt from model-generated
    // characters. ANSI colors are enabled only when stdout is a real terminal.
    const color = process.stdout.isTTY;
    const cyan = color ? '\x1b[36m' : '';
    const green = color ? '\x1b[32m' : '';
    const dim = color ? '\x1b[2m' : '';
    const reset = color ? '\x1b[0m' : '';
    console.log(`${cyan}Neural text generation${reset}`);
    console.log(
      `${dim}temperature=${result.settings.temperature}  top-k=${result.settings.topK}  ` +
      `seed=${result.settings.seed}${reset}\n`
    );
    process.stdout.write(options.prompt);
    process.stdout.write(`${green}${result.generated}${reset}`);
    if (!result.text.endsWith('\n')) process.stdout.write('\n');
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseArgs };
