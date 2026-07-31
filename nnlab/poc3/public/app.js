'use strict';

const $ = (selector) => document.querySelector(selector);
const elements = {
  stateDot: $('#state-dot'),
  stateLabel: $('#state-label'),
  prompt: $('#prompt'),
  length: $('#length'),
  lengthValue: $('#length-value'),
  temperature: $('#temperature'),
  temperatureValue: $('#temperature-value'),
  topK: $('#topk'),
  topKValue: $('#topk-value'),
  seed: $('#seed'),
  generate: $('#generate'),
  output: $('#output'),
  tokenCounter: $('#token-counter'),
  probabilities: $('#probabilities'),
  modelStats: $('#model-stats'),
  train: $('#train'),
  epochs: $('#epochs'),
  context: $('#context'),
  progressBar: $('#progress-bar'),
  trainStatus: $('#train-status'),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function setModelState(ready, label) {
  elements.stateDot.className = `state-dot ${ready ? 'ready' : 'error'}`;
  elements.stateLabel.textContent = label;
}

async function refreshModel() {
  try {
    const model = await api('/api/model');
    setModelState(true, 'Modell bereit');
    const values = [
      Number(model.parameters).toLocaleString('de-DE'),
      `${model.contextSize} Zeichen`,
      `${model.vocabSize} Token`,
      Number(model.finalPerplexity).toFixed(2),
    ];
    [...elements.modelStats.querySelectorAll('dd')].forEach((item, index) => {
      item.textContent = values[index];
    });
    elements.context.value = model.contextSize;
  } catch (error) {
    setModelState(false, 'Training erforderlich');
    elements.trainStatus.textContent = error.message;
  }
}

function printable(char) {
  if (char === '\n') return '↵';
  if (char === ' ') return '␠';
  if (char === '\t') return '⇥';
  return char;
}

function showProbabilities(step) {
  elements.probabilities.replaceChildren();
  for (const item of step.top) {
    const row = document.createElement('div');
    row.className = 'probability';
    const token = document.createElement('span');
    token.className = 'token';
    token.textContent = printable(item.char);
    const track = document.createElement('div');
    track.className = 'bar-track';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${Math.max(2, item.probability * 100)}%`;
    track.append(bar);
    const value = document.createElement('span');
    value.className = 'probability-value';
    value.textContent = `${(item.probability * 100).toFixed(1)} %`;
    row.append(token, track, value);
    elements.probabilities.append(row);
  }
}

async function animateResult(result) {
  elements.output.replaceChildren();
  const prompt = document.createElement('span');
  prompt.className = 'prompt-text';
  prompt.textContent = result.prompt;
  const generated = document.createElement('span');
  generated.className = 'generated-text';
  elements.output.append(prompt, generated);

  const delay = Math.max(4, Math.min(24, 1400 / result.trace.length));
  for (let i = 0; i < result.trace.length; i++) {
    generated.textContent += result.trace[i].char;
    elements.tokenCounter.textContent = `${i + 1} Zeichen`;
    showProbabilities(result.trace[i]);
    if (i % 2 === 0) await sleep(delay);
  }
}

async function generate() {
  elements.generate.disabled = true;
  elements.generate.textContent = 'Modell rechnet …';
  try {
    const result = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: elements.prompt.value,
        maxNewChars: Number(elements.length.value),
        temperature: Number(elements.temperature.value),
        topK: Number(elements.topK.value),
        seed: Number(elements.seed.value),
        stopAtNewline: false,
      }),
    });
    await animateResult(result);
  } catch (error) {
    elements.output.textContent = `Fehler: ${error.message}`;
  } finally {
    elements.generate.disabled = false;
    elements.generate.textContent = 'Text erzeugen →';
  }
}

function updateTrainingStatus(state) {
  const total = state.settings?.epochs || Number(elements.epochs.value);
  const current = state.progress?.epoch || 0;
  elements.progressBar.style.width = `${Math.min(100, 100 * current / total)}%`;
  if (state.status === 'running') {
    const loss = state.progress?.loss == null ? 'initialisiert …' : `Loss ${state.progress.loss.toFixed(3)}`;
    elements.trainStatus.textContent = `Epoche ${current}/${total} · ${loss}`;
  } else if (state.status === 'complete') {
    const mode = state.result?.mode === 'continue' ? 'Erweitert' : 'Neu trainiert';
    elements.trainStatus.textContent = `${mode} · Perplexität ${state.progress.perplexity.toFixed(2)}`;
  } else if (state.status === 'error') {
    elements.trainStatus.textContent = `Fehler · ${state.error}`;
  }
}

async function train() {
  elements.train.disabled = true;
  try {
    let state = await api('/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epochs: Number(elements.epochs.value),
        contextSize: Number(elements.context.value),
        learningRate: 0.12,
        seed: Number(elements.seed.value),
      }),
    });
    updateTrainingStatus(state);
    while (state.status === 'running') {
      await sleep(500);
      state = await api('/api/train/status');
      updateTrainingStatus(state);
    }
    if (state.status === 'complete') await refreshModel();
  } catch (error) {
    elements.trainStatus.textContent = `Fehler · ${error.message}`;
  } finally {
    elements.train.disabled = false;
  }
}

elements.length.addEventListener('input', () => { elements.lengthValue.value = elements.length.value; });
elements.temperature.addEventListener('input', () => {
  elements.temperatureValue.value = Number(elements.temperature.value).toFixed(2);
});
elements.topK.addEventListener('input', () => { elements.topKValue.value = elements.topK.value; });
elements.generate.addEventListener('click', generate);
elements.train.addEventListener('click', train);
elements.prompt.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') generate();
});

refreshModel();
