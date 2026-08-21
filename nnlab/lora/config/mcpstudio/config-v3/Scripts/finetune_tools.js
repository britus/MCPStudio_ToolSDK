const shared = require('sharedFunctions');

function parseParams(jsonParams) {
    if (!jsonParams) {
        return {};
    }
    const params = JSON.parse(jsonParams);
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw new Error('Tool parameters must be a JSON object');
    }
    return params;
}

function projectRoot(params) {
    const value = params.projectRoot;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('projectRoot is required and must be an absolute directory path');
    }
    const validation = shared.validateDirectoryPath(value, 'projectRoot', {
        absolute: true
    });
    if (!validation.ok) {
        throw new Error(validation.message);
    }
    return validation.value;
}

function optionalRelativePath(value, label) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return relativePath(value, '', label);
}

function resolveProjectPath(root, value) {
    return value && value.charAt(0) === '/' ? value : shared.joinPath(root, value);
}

function normalizedDirectoryIdentity(value) {
    let normalized = String(value || '').trim();
    while (normalized.length > 1 && normalized.charAt(normalized.length - 1) === '/') {
        normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
}

function processText(value) {
    if (Array.isArray(value)) {
        return value.join('\n');
    }
    return value === undefined || value === null ? '' : String(value);
}

function structuredResult(run) {
    const combined = processText(run.stdout) + '\n' + processText(run.stderr);
    const lines = combined.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const marker = 'FINETUNE_RESULT_JSON=';
        const position = lines[index].indexOf(marker);
        if (position >= 0) {
            try {
                return JSON.parse(lines[index].substring(position + marker.length));
            } catch (error) {
                return null;
            }
        }
    }
    return null;
}

function relativePath(value, fallback, label) {
    const selected = value || fallback;
    const validation = shared.validatePath(selected, label, { relative: true });
    if (!validation.ok) {
        throw new Error(validation.message);
    }
    return validation.value;
}

function projectConfigPath(value, root, fallback) {
    const selected = value || fallback;
    if (typeof selected !== 'string' || !selected.trim()) {
        throw new Error('configPath must be a non-empty TOML file path');
    }
    const normalized = selected.trim();
    const absolute = normalized.charAt(0) === '/' || normalized.indexOf('file://') === 0
        ? normalized
        : shared.joinPath(root, relativePath(normalized, '', 'configPath'));
    const configPath = absoluteDocumentPath(absolute, 'configPath');
    if (pathExtension(configPath) !== '.toml') {
        throw new Error('configPath must be a TOML file');
    }
    return configPath;
}

function stringArray(value, fallback, label) {
    const selected = value === undefined ? fallback : value;
    if (!Array.isArray(selected) || !selected.every(function (item) {
        return typeof item === 'string';
    })) {
        throw new Error(label + ' must be an array of strings');
    }
    return selected;
}

function evidenceText(value, label) {
    let parts;
    if (typeof value === 'string') {
        parts = [value];
    } else if (Array.isArray(value) && value.every(function (item) {
        return typeof item === 'string';
    })) {
        parts = value;
    } else {
        throw new Error(label + ' must be a non-empty string or array of strings');
    }
    const normalized = parts.map(function (item) {
        return item.trim();
    }).filter(Boolean);
    if (normalized.length === 0) {
        throw new Error(label + ' must contain non-empty evidence');
    }
    return normalized.join('\n');
}

function sourcePlan(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('sourcePlan must be a JSON object');
    }
    const requiredSubjects = stringArray(
        value.requiredSubjects,
        [],
        'sourcePlan.requiredSubjects'
    ).map(function (item) { return item.trim(); }).filter(Boolean);
    if (requiredSubjects.length === 0) {
        throw new Error('sourcePlan.requiredSubjects must contain at least one subject');
    }
    const requiredSubjectSet = {};
    requiredSubjects.forEach(function (subject) {
        requiredSubjectSet[subject] = true;
    });
    const coveredSubjectSet = {};
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
        throw new Error('sourcePlan.sources must contain at least one source');
    }
    const sources = value.sources.map(function (item, index) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('sourcePlan.sources[' + index + '] must be an object');
        }
        const subjects = stringArray(
            item.subjects,
            [],
            'sourcePlan.sources[' + index + '].subjects'
        ).map(function (subject) { return subject.trim(); }).filter(Boolean);
        if (subjects.length === 0) {
            throw new Error(
                'sourcePlan.sources[' + index + '].subjects must contain at least one subject'
            );
        }
        const unknownSubjects = subjects.filter(function (subject) {
            return !requiredSubjectSet[subject];
        });
        if (unknownSubjects.length > 0) {
            throw new Error(
                'sourcePlan.sources[' + index + '] contains subjects not listed in requiredSubjects: ' +
                unknownSubjects.join(', ')
            );
        }
        subjects.forEach(function (subject) {
            coveredSubjectSet[subject] = true;
        });
        const evidence = evidenceText(
            item.evidence,
            'sourcePlan.sources[' + index + '].evidence'
        );
        return {
            path: absoluteDocumentPath(item.path, 'sourcePlan.sources[' + index + '].path'),
            subjects: subjects,
            evidence: evidence
        };
    });
    const missingSubjects = requiredSubjects.filter(function (subject) {
        return !coveredSubjectSet[subject];
    });
    if (missingSubjects.length > 0) {
        throw new Error(
            'sourcePlan does not cover requiredSubjects: ' + missingSubjects.join(', ')
        );
    }
    return { requiredSubjects: requiredSubjects, sources: sources };
}

function absoluteDocumentPath(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(label + ' must be a non-empty file path or file:// URI');
    }
    let selected = value.trim();
    if (selected.indexOf('file://') === 0) {
        selected = selected.substring('file://'.length);
        if (selected.indexOf('localhost/') === 0) {
            selected = selected.substring('localhost'.length);
        }
        try {
            selected = decodeURIComponent(selected);
        } catch (error) {
            throw new Error(label + ' contains an invalid file URI');
        }
    }
    const validation = shared.validateFilePath(selected, label, { absolute: true });
    if (!validation.ok) {
        throw new Error(validation.message);
    }
    if (!MCPStudio.fileExists(validation.value)) {
        throw new Error(label + ' does not exist: ' + validation.value);
    }
    return validation.value;
}

function optionalProjectFilePath(value, root, label) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }
    const selected = String(value).trim();
    if (selected.charAt(0) === '/' || selected.indexOf('file://') === 0) {
        return absoluteDocumentPath(selected, label);
    }
    const relative = relativePath(selected, '', label);
    const resolved = resolveProjectPath(root, relative);
    if (!MCPStudio.fileExists(resolved)) {
        throw new Error(label + ' does not exist: ' + resolved);
    }
    return relative;
}

function optionalProjectAdapterPath(value, root, label) {
    const selected = optionalRelativePath(value, label);
    if (!selected) {
        return null;
    }
    const weights = resolveProjectPath(root, selected + '/adapters.safetensors');
    const config = resolveProjectPath(root, selected + '/adapter_config.json');
    if (!MCPStudio.fileExists(weights) || !MCPStudio.fileExists(config)) {
        throw new Error(label + ' must contain adapters.safetensors and adapter_config.json');
    }
    return selected;
}

function pathBaseName(value) {
    const parts = value.split('/');
    return parts[parts.length - 1] || 'document';
}

function pathExtension(value) {
    const name = pathBaseName(value);
    const index = name.lastIndexOf('.');
    return index < 0 ? '' : name.substring(index).toLowerCase();
}

function withoutExtension(value) {
    const index = value.lastIndexOf('.');
    return index < 0 ? value : value.substring(0, index);
}

function safeSegment(value) {
    return String(value || 'session').replace(/[^A-Za-z0-9_-]/g, '-').substring(0, 48);
}

function numberedSegment(index) {
    const number = String(index + 1);
    return 'document-' + ('000' + number).substring(number.length);
}

function loadTrainingObjective(params) {
    const root = projectRoot(params);
    const objectiveFile = params.objectiveFile === undefined || params.objectiveFile === null
        ? ''
        : String(params.objectiveFile).trim();
    const inlineObjective = params.objectiveText === undefined || params.objectiveText === null
        ? ''
        : String(params.objectiveText).trim();
    let trainingGoal = inlineObjective;
    let resolvedFile = '';
    let sourceMode = 'inline';

    if (objectiveFile) {
        resolvedFile = absoluteDocumentPath(objectiveFile, 'objectiveFile');
        const extension = pathExtension(resolvedFile);
        if (extension !== '.txt' && extension !== '.md') {
            return shared.error('objectiveFile must be a UTF-8 .txt or .md file');
        }
        const content = MCPStudio.readFile(resolvedFile);
        if (content === null || content === undefined) {
            return shared.error('Training objective file is not readable: ' + resolvedFile);
        }
        trainingGoal = String(content).trim();
        sourceMode = 'file';
    }

    if (!trainingGoal) {
        return shared.error('A non-empty objectiveFile or objectiveText is required');
    }
    if (trainingGoal.length > 262144) {
        return shared.error('Training objective exceeds the 262144 character limit');
    }

    const lineCount = trainingGoal.split(/\r?\n/).length;
    return shared.setProcessResult(
        true,
        'Training objective loaded and validated.',
        '',
        {
            operation: 'finetuneLoadTrainingObjective',
            projectRoot: root,
            objectiveFile: resolvedFile,
            objectiveSourceMode: sourceMode,
            objectiveCharacters: trainingGoal.length,
            objectiveLines: lineCount,
            trainingGoal: trainingGoal
        },
        [],
        []
    );
}

function loadVerificationInput(params) {
    const root = projectRoot(params);
    const verificationConfig = absoluteDocumentPath(
        params.verificationConfig,
        'verificationConfig'
    );
    if (pathExtension(verificationConfig) !== '.json') {
        return shared.error('verificationConfig must be a JSON file');
    }
    const content = MCPStudio.readFile(verificationConfig);
    if (content === null || content === undefined) {
        return shared.error('Verification input is not readable: ' + verificationConfig);
    }
    const text = String(content);
    if (text.length > 1048576) {
        return shared.error('Verification input exceeds the 1048576 character limit');
    }
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (error) {
        return shared.error('Verification input is not valid JSON');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return shared.error('Verification input must be one JSON object');
    }
    if (payload.schemaVersion !== 1) {
        return shared.error('Unsupported verification input schemaVersion');
    }
    const payloadRoot = shared.validateDirectoryPath(
        String(payload.projectRoot || '').trim(),
        'verificationInput.projectRoot',
        { absolute: true }
    );
    if (!payloadRoot.ok ||
        normalizedDirectoryIdentity(payloadRoot.value) !== normalizedDirectoryIdentity(root)) {
        return shared.error('Verification input projectRoot does not match the active chat project');
    }

    const configPath = relativePath(payload.configPath, '', 'configPath');
    if (!MCPStudio.fileExists(resolveProjectPath(root, configPath))) {
        return shared.error('Verification configPath does not exist: ' + configPath);
    }
    const promptsFile = optionalProjectFilePath(payload.promptsFile, root, 'promptsFile');
    const outputFile = relativePath(payload.outputFile, '', 'outputFile');
    if (typeof payload.subjectContext !== 'string' ||
        typeof payload.acceptanceCriteria !== 'string') {
        return shared.error('subjectContext and acceptanceCriteria must be strings');
    }
    const subjectContext = payload.subjectContext.trim();
    const acceptanceCriteria = payload.acceptanceCriteria.trim();
    if (!subjectContext || !acceptanceCriteria) {
        return shared.error('subjectContext and acceptanceCriteria must be non-empty strings');
    }
    if (subjectContext.length > 262144 || acceptanceCriteria.length > 32768) {
        return shared.error('Verification context or acceptance criteria exceeds the limit');
    }
    const master = optionalRelativePath(payload.master, 'master');
    if (!master) {
        return shared.error('master is required');
    }
    const masterWeightsPresent = MCPStudio.fileExists(
        resolveProjectPath(root, master + '/adapters.safetensors')
    );
    const masterConfigPresent = MCPStudio.fileExists(
        resolveProjectPath(root, master + '/adapter_config.json')
    );
    if (masterWeightsPresent !== masterConfigPresent) {
        return shared.error(
            'master is incomplete; adapters.safetensors and adapter_config.json ' +
            'must either both exist or both be absent'
        );
    }
    const bootstrapRequired = !masterWeightsPresent;
    const adapters = stringArray(payload.adapters, [], 'adapters').map(function (item) {
        const adapter = optionalProjectAdapterPath(item, root, 'adapter');
        if (!adapter) {
            throw new Error('Every adapter path must be non-empty');
        }
        return adapter;
    });
    if (adapters.length === 0) {
        return shared.error('adapters must contain at least one trained adapter');
    }
    const weights = stringArray(payload.weights, [], 'weights');
    if (weights.length !== 0 && weights.length !== adapters.length + 1) {
        return shared.error('weights must be empty or contain one value for master plus each adapter');
    }
    if (weights.some(function (value) {
        return value.trim() === '' || !isFinite(Number(value));
    })) {
        return shared.error('weights must contain finite numeric strings');
    }
    const output = relativePath(payload.output, '', 'output');
    if (output === master || adapters.indexOf(output) >= 0) {
        return shared.error('output must differ from every merge input');
    }
    if (typeof payload.force !== 'boolean') {
        return shared.error('force must be Boolean');
    }

    return shared.setProcessResult(
        true,
        'Verification input loaded and validated.',
        '',
        {
            operation: 'finetuneLoadVerificationInput',
            verificationConfig: verificationConfig,
            projectRoot: root,
            configPath: configPath,
            promptsFile: promptsFile,
            outputFile: outputFile,
            subjectContext: subjectContext,
            acceptanceCriteria: acceptanceCriteria,
            master: master,
            bootstrapRequired: bootstrapRequired,
            adapters: adapters,
            weights: weights,
            output: output,
            force: payload.force
        },
        [],
        []
    );
}

function prepareDocuments(params, sid) {
    const root = projectRoot(params);
    const configPath = projectConfigPath(
        params.configPath,
        root,
        'config/mcpstudio-v3.toml'
    );
    const stagingRoot = relativePath(
        params.textOutputDir,
        'data/prepared_docs',
        'textOutputDir'
    );
    const plan = params.sourcePlan ? sourcePlan(params.sourcePlan) : null;
    const documents = plan
        ? plan.sources.map(function (item) { return item.path; })
        : stringArray(params.documentPaths, [], 'documentPaths');
    if (documents.length === 0) {
        return shared.error('sourcePlan.sources or documentPaths must contain a document');
    }
    const sourcePaths = plan ? documents : documents.map(function (item, index) {
        return absoluteDocumentPath(item, 'documentPaths[' + index + ']');
    });
    const runSegment = 'run-' + Date.now() + '-' + safeSegment(sid);
    const runRelativePath = shared.joinPath(stagingRoot, runSegment);
    const runPath = shared.joinPath(root, runRelativePath);
    const extractScript = shared.resolveDeveloperTool(
        shared.joinPath(root, 'scripts/extract_pdfs.sh'),
        'PDF extraction executable'
    );
    const output = shared.createProcessOutput();
    const materializedPaths = [];
    const materializedPolicySources = [];

    for (let index = 0; index < sourcePaths.length; index += 1) {
        const source = sourcePaths[index];
        const documentDir = shared.joinPath(runPath, numberedSegment(index));
        const extension = pathExtension(source);
        if (extension === '.pdf') {
            if (!extractScript.ok) {
                return shared.error(extractScript.message);
            }
            const extraction = shared.executeProcess(
                extractScript.value,
                ['--source', source, '--output', documentDir]
            );
            shared.appendProcessRun(output, 'Extract ' + pathBaseName(source), extraction);
            if (!extraction.success) {
                return shared.setProcessResult(
                    false,
                    '',
                    'Document preparation stopped because PDF extraction failed.',
                    {
                        operation: 'finetunePrepareDocuments',
                        projectRoot: root,
                        documentPaths: sourcePaths,
                        stagingDirectory: runRelativePath
                    },
                    output.stdout,
                    output.stderr
                );
            }
            const extractedPath = shared.joinPath(
                documentDir,
                withoutExtension(pathBaseName(source)) + '.txt'
            );
            if (!MCPStudio.fileExists(extractedPath)) {
                return shared.setProcessResult(
                    false,
                    '',
                    'Document preparation stopped because PDF extraction produced no text file.',
                    {
                        operation: 'finetunePrepareDocuments',
                        projectRoot: root,
                        documentPaths: sourcePaths,
                        failedDocument: source,
                        expectedTextPath: extractedPath,
                        stagingDirectory: runRelativePath
                    },
                    output.stdout,
                    output.stderr
                );
            }
            materializedPaths.push(extractedPath);
            materializedPolicySources.push({
                path: shared.joinPath(
                    numberedSegment(index),
                    withoutExtension(pathBaseName(source)) + '.txt'
                ),
                subjects: plan ? plan.sources[index].subjects : []
            });
            continue;
        }

        const sourceText = MCPStudio.readFile(source);
        if (sourceText === null || sourceText === undefined) {
            return shared.error('Document is not readable as text: ' + source);
        }
        shared.ensureDirectory(documentDir);
        const target = shared.joinPath(documentDir, withoutExtension(pathBaseName(source)) + '.txt');
        if (MCPStudio.saveFile(target, sourceText) !== true) {
            return shared.error('Could not materialize document: ' + source);
        }
        materializedPaths.push(target);
        materializedPolicySources.push({
            path: shared.joinPath(
                numberedSegment(index),
                withoutExtension(pathBaseName(source)) + '.txt'
            ),
            subjects: plan ? plan.sources[index].subjects : []
        });
        output.stdout.push('Materialized text document ' + source + ' as ' + target);
    }

    // Keep the policy contract outside the document input directory so the
    // generic scanner cannot turn workflow control data into training records.
    const policyPath = shared.joinPath(
        root,
        shared.joinPath(stagingRoot, runSegment + '-dataset-policy.json')
    );
    if (plan && MCPStudio.saveFile(policyPath, JSON.stringify({
        format: 1,
        requiredSubjects: plan.requiredSubjects,
        sources: materializedPolicySources
    }, null, 2) + '\n') !== true) {
        return shared.error('Could not write the dataset policy contract');
    }

    const prepareScript = shared.resolveDeveloperTool(
        shared.joinPath(root, 'scripts/prepare_docs.sh'),
        'document preparation executable'
    );
    if (!prepareScript.ok) {
        return shared.error(prepareScript.message);
    }
    const prepareArgs = ['--config', configPath, '--input', runPath];
    if (plan) {
        prepareArgs.push('--policy-file', policyPath);
    }
    const preparation = shared.executeProcess(prepareScript.value, prepareArgs);
    shared.appendProcessRun(output, 'Build training dataset', preparation);
    const result = structuredResult(preparation);
    const manifestPath = result && typeof result.manifestPath === 'string'
        ? result.manifestPath
        : '';
    const trainRecords = result && Number(result.trainRecords) || 0;
    const validationRecords = result && Number(result.validationRecords) || 0;
    const includedFiles = result && Number(result.includedFiles) || 0;
    const policyPass = !plan || Boolean(result && result.policyPass === true);
    const policyStatus = result && result.policyStatus || '';
    const sourceCoverage = includedFiles === materializedPaths.length;
    const manifestPresent = manifestPath
        ? MCPStudio.fileExists(resolveProjectPath(root, manifestPath))
        : false;
    const succeeded = preparation.success && result !== null && manifestPresent &&
        sourceCoverage && policyPass && trainRecords > 0 && validationRecords > 0;

    return shared.setProcessResult(
        succeeded,
        'Documents were materialized and the training dataset was rebuilt successfully.',
        'Document preparation or manifest validation failed.',
        {
            operation: 'finetunePrepareDocuments',
            projectRoot: root,
            configPath: configPath,
            manifestPath: manifestPath,
            stagingDirectory: runRelativePath,
            policyPath: plan ? policyPath : '',
            documentPaths: sourcePaths,
            materializedPaths: materializedPaths,
            includedFiles: includedFiles,
            sourceCoverage: sourceCoverage,
            policyPass: policyPass,
            policyStatus: policyStatus,
            missingTrainSubjects: result && result.missingTrainSubjects || [],
            missingValidationSubjects: result && result.missingValidationSubjects || [],
            duplicateFiles: result && result.duplicateFiles || [],
            unmappedFiles: result && result.unmappedFiles || [],
            unusedPolicySources: result && result.unusedPolicySources || [],
            datasetPolicy: result && result.datasetPolicy || {},
            trainRecords: trainRecords,
            validationRecords: validationRecords
        },
        output.stdout,
        output.stderr
    );
}

function runScript(root, scriptRelativePath, args, operation) {
    const script = shared.joinPath(root, scriptRelativePath);
    const resolution = shared.resolveDeveloperTool(script, operation + ' executable');
    if (!resolution.ok) {
        return shared.error(resolution.message);
    }
    const run = shared.executeProcess(resolution.value, args);
    return shared.setProcessResult(
        run.success,
        operation + ' completed successfully.',
        operation + ' failed.',
        {
            operation: operation,
            projectRoot: root,
            executable: resolution.value
        },
        run.stdout,
        run.stderr
    );
}

function trainAdapter(params) {
    const root = projectRoot(params);
    const configPath = projectConfigPath(
        params.configPath,
        root,
        'config/mcpstudio-v3.toml'
    );
    const smokeTest = params.smokeTest === true;
    const operation = smokeTest ? 'finetuneTrainSmokeTest' : 'finetuneTrainAdapter';
    const script = shared.joinPath(
        root,
        smokeTest ? 'scripts/smoke_train.sh' : 'scripts/train.sh'
    );
    const resolution = shared.resolveDeveloperTool(script, operation + ' executable');
    if (!resolution.ok) {
        return shared.error(resolution.message);
    }
    const args = ['--config', configPath];
    const objectiveFile = params.objectiveFile === undefined || params.objectiveFile === null ||
        String(params.objectiveFile).trim() === ''
        ? ''
        : absoluteDocumentPath(params.objectiveFile, 'objectiveFile');
    if (objectiveFile && !smokeTest) {
        args.push('--objective-file', objectiveFile);
    }
    const run = shared.executeProcess(resolution.value, args);
    const result = structuredResult(run);
    const errors = [];
    const trainRecords = result && Number(result.trainRecords) || 0;
    const validationRecords = result && Number(result.validationRecords) || 0;
    const earlyStopped = Boolean(result && result.earlyStopped === true);
    const bestCheckpoint = result && result.bestCheckpoint || '';
    const bestIteration = result && result.bestIteration || null;
    const bestValidationLoss = result && result.bestValidationLoss;
    const verificationInputPath = result && result.verificationInputPath || '';
    const expectedOutputDir = optionalRelativePath(params.expectedOutputDir, 'expectedOutputDir');
    const artifactPath = expectedOutputDir
        ? shared.joinPath(expectedOutputDir, 'adapters.safetensors')
        : result && result.artifactPath || '';
    const artifactPresent = artifactPath
        ? MCPStudio.fileExists(resolveProjectPath(root, artifactPath))
        : false;
    const combined = processText(run.stdout) + '\n' + processText(run.stderr);
    const finiteMetrics = !(result && result.finiteMetrics === false) &&
        !/(^|[^a-z])(nan|[+-]?inf(?:inity)?)([^a-z]|$)/i.test(combined);

    if (!run.success) {
        errors.push('Training process failed.');
    }
    if (!result) {
        errors.push('Training process did not emit a structured result.');
    }
    if (params.requirePreparedDataset === true && (trainRecords < 1 || validationRecords < 1)) {
        errors.push('Prepared train and validation record counts are required.');
    }
    if (!finiteMetrics) {
        errors.push('Training reported a non-finite metric.');
    }
    if (!smokeTest && validationRecords > 0 && !bestCheckpoint) {
        errors.push('Validation-based best checkpoint selection produced no checkpoint.');
    }
    if (expectedOutputDir && !artifactPresent) {
        errors.push('Expected adapter artifact is missing: ' + artifactPath);
    }
    if (!smokeTest && objectiveFile && (!verificationInputPath ||
        !MCPStudio.fileExists(resolveProjectPath(root, verificationInputPath)))) {
        errors.push('Full training did not produce a readable verification input file.');
    }

    return shared.setProcessResult(
        errors.length === 0,
        operation + ' completed and passed executable validation.',
        errors.join(' '),
        {
            operation: operation,
            projectRoot: root,
            configPath: configPath,
            artifactPath: artifactPath,
            artifactPresent: artifactPresent,
            finiteMetrics: finiteMetrics,
            trainRecords: trainRecords,
            validationRecords: validationRecords,
            earlyStopped: earlyStopped,
            bestCheckpoint: bestCheckpoint,
            bestIteration: bestIteration,
            bestValidationLoss: bestValidationLoss,
            verificationInputPath: verificationInputPath,
            validationErrors: errors
        },
        run.stdout,
        run.stderr
    );
}

function verifyMaster(params) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v3.toml',
        'configPath'
    );
    const args = ['--config', configPath];
    const adapter = optionalProjectAdapterPath(params.adapter, root, 'adapter');
    const promptsFile = optionalProjectFilePath(params.promptsFile, root, 'promptsFile');
    const outputFile = optionalRelativePath(params.outputFile, 'outputFile');
    if (adapter) { args.push('--adapter', adapter); }
    if (promptsFile) { args.push('--prompts', promptsFile); }
    if (outputFile) { args.push('--output', outputFile); }

    const script = shared.joinPath(root, 'scripts/verify_master.sh');
    const resolution = shared.resolveDeveloperTool(script, 'finetuneVerifyMaster executable');
    if (!resolution.ok) {
        return shared.error(resolution.message);
    }
    const run = shared.executeProcess(resolution.value, args);
    const result = structuredResult(run);
    const reportPath = result && typeof result.reportPath === 'string' ? result.reportPath : '';
    const reportPresent = reportPath
        ? MCPStudio.fileExists(resolveProjectPath(root, reportPath))
        : false;
    const promptPassRate = result && typeof result.promptPassRate === 'number'
        ? result.promptPassRate
        : undefined;
    return shared.setProcessResult(
        run.success && result !== null && reportPresent,
        'finetuneVerifyMaster completed and produced a verification report.',
        'Verification failed or did not produce a readable structured report.',
        {
            operation: 'finetuneVerifyMaster',
            projectRoot: root,
            configPath: configPath,
            adapter: adapter || '',
            promptsFile: promptsFile || '',
            reportPath: reportPath,
            promptCount: result && result.promptCount || 0,
            promptPassRate: promptPassRate
        },
        run.stdout,
        run.stderr
    );
}

function mergeAdapters(params) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v3.toml',
        'configPath'
    );
    const args = ['--config', configPath];
    const master = optionalRelativePath(params.master, 'master');
    if (master) { args.push('--master', master); }
    let adapterOverrides = null;
    if (params.adapters !== undefined) {
        adapterOverrides = stringArray(params.adapters, [], 'adapters').map(function (item) {
            return relativePath(item, '', 'adapter');
        });
        if (adapterOverrides.length > 0) {
            args.push('--adapters');
            Array.prototype.push.apply(args, adapterOverrides);
        }
    }
    if (params.weights !== undefined) {
        let weights = stringArray(params.weights, [], 'weights');
        if (weights.length === 0 && adapterOverrides && adapterOverrides.length > 0) {
            weights = new Array(adapterOverrides.length + 1).fill('1');
        }
        if (weights.length > 0) {
            args.push('--weights');
            Array.prototype.push.apply(args, weights);
        }
    }
    let output = null;
    if (params.inPlace === true) {
        args.push('--in-place');
    } else if (params.output !== undefined && params.output !== null && params.output !== '') {
        output = relativePath(params.output, '', 'output');
        args.push('--output', output);
    }
    if (params.force === true) {
        args.push('--force');
    }
    const script = shared.joinPath(root, 'scripts/merge_adapters.sh');
    const resolution = shared.resolveDeveloperTool(script, 'finetuneMergeAdapters executable');
    if (!resolution.ok) {
        return shared.error(resolution.message);
    }
    const run = shared.executeProcess(resolution.value, args);
    const result = structuredResult(run);
    const adapter = result && typeof result.adapter === 'string'
        ? result.adapter
        : (params.inPlace === true ? master : output || '');
    const mergeReportPath = result && typeof result.mergeReportPath === 'string'
        ? result.mergeReportPath
        : (adapter ? adapter + '/merge_report.json' : '');
    const adapterPresent = adapter
        ? MCPStudio.fileExists(resolveProjectPath(root, adapter + '/adapters.safetensors'))
        : false;
    const reportPresent = mergeReportPath
        ? MCPStudio.fileExists(resolveProjectPath(root, mergeReportPath))
        : false;
    const success = run.success && result !== null && adapterPresent && reportPresent;
    return shared.setProcessResult(
        success,
        'finetuneMergeAdapters completed and produced a validated candidate.',
        'Merge failed or did not produce a readable adapter and merge report.',
        {
            operation: 'finetuneMergeAdapters',
            projectRoot: root,
            configPath: configPath,
            adapter: adapter,
            mergeReportPath: mergeReportPath,
            mergedSha256: result && result.mergedSha256 || '',
            method: result && result.method || ''
        },
        run.stdout,
        run.stderr
    );
}

function deploy(params, replace) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v3.toml',
        'configPath'
    );
    const args = ['--config', configPath];
    if (replace) {
        args.push('--replace');
    }
    if (params.dryRun === true) {
        args.push('--dry-run');
    }
    return runScript(
        root,
        'deploy/lm-studio/install.sh',
        args,
        replace ? 'finetuneLmStudioUpdate' : 'finetuneLmStudioInstall'
    );
}

const HANDLERS = {
    finetuneLoadTrainingObjective: loadTrainingObjective,
    finetuneLoadVerificationInput: loadVerificationInput,
    finetunePrepareDocuments: prepareDocuments,
    finetuneTrainAdapter: trainAdapter,
    finetuneVerifyMaster: verifyMaster,
    finetuneMergeAdapters: mergeAdapters,
    finetuneLmStudioInstall: function (params) { return deploy(params, false); },
    finetuneLmStudioUpdate: function (params) { return deploy(params, true); }
};

function toolEntry(sid, handlerName, jsonParams) {
    try {
        if (!Object.prototype.hasOwnProperty.call(HANDLERS, handlerName)) {
            return shared.error('Unknown fine-tuning project handler: ' + handlerName);
        }
        return HANDLERS[handlerName](parseParams(jsonParams), sid);
    } catch (error) {
        return shared.error(error && error.message ? error.message : String(error));
    }
}

module.exports = { toolEntry };
