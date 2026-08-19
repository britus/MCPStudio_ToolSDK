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

function stringArray(value, fallback, label) {
    const selected = value === undefined ? fallback : value;
    if (!Array.isArray(selected) || !selected.every(function (item) {
        return typeof item === 'string';
    })) {
        throw new Error(label + ' must be an array of strings');
    }
    return selected;
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

function prepareDocuments(params, sid) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v2.toml',
        'configPath'
    );
    const stagingRoot = relativePath(
        params.textOutputDir,
        'data/prepared_docs',
        'textOutputDir'
    );
    const documents = stringArray(params.documentPaths, [], 'documentPaths');
    if (documents.length === 0) {
        return shared.error('documentPaths must contain at least one document');
    }

    const sourcePaths = documents.map(function (item, index) {
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
            materializedPaths.push(
                shared.joinPath(documentDir, withoutExtension(pathBaseName(source)) + '.txt')
            );
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
        output.stdout.push('Materialized text document ' + source + ' as ' + target);
    }

    const prepareScript = shared.resolveDeveloperTool(
        shared.joinPath(root, 'scripts/prepare_docs.sh'),
        'document preparation executable'
    );
    if (!prepareScript.ok) {
        return shared.error(prepareScript.message);
    }
    const preparation = shared.executeProcess(
        prepareScript.value,
        ['--config', configPath, '--input', runPath]
    );
    shared.appendProcessRun(output, 'Build training dataset', preparation);
    const result = structuredResult(preparation);
    const manifestPath = result && typeof result.manifestPath === 'string'
        ? result.manifestPath
        : '';
    const trainRecords = result && Number(result.trainRecords) || 0;
    const validationRecords = result && Number(result.validationRecords) || 0;
    const includedFiles = result && Number(result.includedFiles) || 0;
    const sourceCoverage = includedFiles === materializedPaths.length;
    const manifestPresent = manifestPath
        ? MCPStudio.fileExists(resolveProjectPath(root, manifestPath))
        : false;
    const succeeded = preparation.success && result !== null && manifestPresent &&
        sourceCoverage && trainRecords > 0 && validationRecords > 0;

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
            documentPaths: sourcePaths,
            materializedPaths: materializedPaths,
            includedFiles: includedFiles,
            sourceCoverage: sourceCoverage,
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
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v2.toml',
        'configPath'
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
    const run = shared.executeProcess(resolution.value, ['--config', configPath]);
    const result = structuredResult(run);
    const errors = [];
    const trainRecords = result && Number(result.trainRecords) || 0;
    const validationRecords = result && Number(result.validationRecords) || 0;
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
    if (expectedOutputDir && !artifactPresent) {
        errors.push('Expected adapter artifact is missing: ' + artifactPath);
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
        'config/mcpstudio-v2.toml',
        'configPath'
    );
    const args = ['--config', configPath];
    const adapter = optionalRelativePath(params.adapter, 'adapter');
    const promptsFile = optionalRelativePath(params.promptsFile, 'promptsFile');
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
    return shared.setProcessResult(
        run.success && result !== null && reportPresent,
        'finetuneVerifyMaster completed and produced a verification report.',
        'Verification failed or did not produce a readable structured report.',
        {
            operation: 'finetuneVerifyMaster',
            projectRoot: root,
            configPath: configPath,
            reportPath: reportPath
        },
        run.stdout,
        run.stderr
    );
}

function mergeAdapters(params) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v2.toml',
        'configPath'
    );
    const args = ['--config', configPath];
    const master = optionalRelativePath(params.master, 'master');
    if (master) { args.push('--master', master); }
    if (params.adapters !== undefined) {
        const adapters = stringArray(params.adapters, [], 'adapters').map(function (item) {
            return relativePath(item, '', 'adapter');
        });
        args.push('--adapters');
        Array.prototype.push.apply(args, adapters);
    }
    if (params.weights !== undefined) {
        const weights = stringArray(params.weights, [], 'weights');
        args.push('--weights');
        Array.prototype.push.apply(args, weights);
    }
    if (params.inPlace === true) {
        args.push('--in-place');
    } else if (params.output !== undefined && params.output !== null && params.output !== '') {
        args.push(
            '--output',
            relativePath(params.output, '', 'output')
        );
    }
    if (params.force === true) {
        args.push('--force');
    }
    return runScript(root, 'scripts/merge_adapters.sh', args, 'finetuneMergeAdapters');
}

function deploy(params, replace) {
    const root = projectRoot(params);
    const configPath = relativePath(
        params.configPath,
        'config/mcpstudio-v2.toml',
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
