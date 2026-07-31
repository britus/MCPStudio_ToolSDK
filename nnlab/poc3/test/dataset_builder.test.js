'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDatasets } = require('../agent_dataset_builder');

test('dataset builder archives new data and creates a deterministic replay mix', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-builder-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const projectDirectory = path.join(root, 'project');
  const datasetRoot = path.join(projectDirectory, 'datasets');
  const sourcePath = path.join(root, 'new-source.txt');
  const modelPath = path.join(projectDirectory, 'model.safetensors');
  const trainPath = path.join(projectDirectory, 'train.js');
  const legacyOutput = path.join(projectDirectory, 'adk_training_dataset.txt');
  fs.mkdirSync(projectDirectory, { recursive: true });
  fs.writeFileSync(modelPath, 'test-model');
  fs.writeFileSync(trainPath, '// test trainer');
  fs.writeFileSync(legacyOutput, 'old one\nold two\nold three\nold four\n');
  fs.writeFileSync(
    sourcePath,
    'new one\nnew two\nnew three\nnew four\nnew five\nnew six\n'
  );

  const result = await buildDatasets({
    projectDirectory,
    datasetDirectory: datasetRoot,
    datasetResources: [{ type: 'file', value: sourcePath }],
    epochs: 7,
    learningRate: 0.03,
    seed: 123,
    newDataRatio: 0.6,
  }, {
    projectDirectory,
    datasetRoot,
    modelPath,
    trainPath,
    legacyOutput,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.trainingMode, 'continue');
  assert.equal(result.archiveSequence, 2);
  assert.ok(result.migratedLegacyDataset.endsWith('dataset_000001.txt'));
  assert.ok(result.newDatasetPath.endsWith('dataset_000002.txt'));
  assert.ok(result.mixedDatasetPath.endsWith('training_mix_000002.txt'));
  assert.equal(result.newDatasetLineCount, 6);
  assert.equal(result.replayLineCount, 4);
  assert.equal(result.datasetLineCount, 10);
  assert.equal(result.actualNewDataRatio, 0.6);
  assert.deepEqual(result.scriptArguments, [
    result.mixedDatasetPath,
    '--epochs', '7',
    '--learning-rate', '0.03',
    '--seed', '123',
  ]);

  const mixedLines = fs.readFileSync(result.mixedDatasetPath, 'utf8').trim().split('\n');
  assert.equal(new Set(mixedLines).size, 10);
  assert.equal(fs.readFileSync(legacyOutput, 'utf8'), fs.readFileSync(result.mixedDatasetPath, 'utf8'));
  assert.ok(fs.existsSync(result.mixedDatasetManifestPath));
  assert.ok(fs.existsSync(path.join(datasetRoot, 'latest.json')));
});
