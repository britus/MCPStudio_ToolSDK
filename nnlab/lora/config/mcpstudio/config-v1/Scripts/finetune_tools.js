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
        'mcpstudio/config/Training/finetune-master-candidate.toml',
        'configPath'
    );
    const manifestPath = relativePath(
        params.manifestPath,
        'data/processed/manifest.json',
        'manifestPath'
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
            const extraction = shared.executeProcess(extractScript.value, [source, documentDir]);
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
    const preparation = shared.executeProcess(prepareScript.value, [configPath, runPath]);
    shared.appendProcessRun(output, 'Build training dataset', preparation);

    let manifest = null;
    const manifestFile = shared.joinPath(root, manifestPath);
    if (preparation.success && MCPStudio.fileExists(manifestFile)) {
        try {
            manifest = JSON.parse(MCPStudio.readFile(manifestFile));
        } catch (error) {
            output.stderr.push('Generated manifest is not valid JSON: ' + manifestFile);
        }
    }
    const trainRecords = manifest && Number(manifest.train_records) || 0;
    const validationRecords = manifest && Number(manifest.validation_records) || 0;
    const includedFiles = manifest && Array.isArray(manifest.projects)
        ? manifest.projects.reduce(function (total, project) {
            return total + (Number(project.included_files) || 0);
        }, 0)
        : 0;
    const succeeded = preparation.success && manifest !== null && trainRecords > 0;

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
        'config/default.toml',
        'configPath'
    );
    const smokeTest = params.smokeTest === true;
    return runScript(
        root,
        smokeTest ? 'scripts/smoke_train.sh' : 'scripts/train.sh',
        [configPath],
        smokeTest ? 'finetuneTrainSmokeTest' : 'finetuneTrainAdapter'
    );
}

function verifyMaster(params) {
    const root = projectRoot(params);
    const mode = params.mode || 'all';
    if (['prompts', 'huawei', 'quectel', 'all'].indexOf(mode) < 0) {
        return shared.error('mode must be one of: prompts, huawei, quectel, all');
    }
    const adapter = relativePath(
        params.adapter,
        'artifacts/finetune_lora',
        'adapter'
    );
    return runScript(
        root,
        'scripts/verify_master.sh',
        [mode, adapter],
        'finetuneVerifyMaster'
    );
}

function mergeAdapters(params) {
    const root = projectRoot(params);
    const master = relativePath(
        params.master,
        'artifacts/finetune_lora',
        'master'
    );
    const adapters = stringArray(
        params.adapters,    /* Agent workflow input */
        [                   /* Fallback change as you need */
            'artifacts/huawei-lora-adapter',
            'artifacts/quectel-lora-adapter'
        ],
        'adapters'          /* Operation label */
    ).map(function (item) {
        return relativePath(item, '', 'adapter');
    });
    const weights = stringArray(
        params.weights,     /* Agent workflow input */
        [                   /* Fallback change as you need */
            '0.3333333333333333', 
            '0.3333333333333333', 
            '0.3333333333333333'
        ],
        'weights'           /* Operation label */
    );
    if (weights.length !== adapters.length + 1) {
        return shared.error('weights must contain one value for the master and each adapter');
    }

    const args = ['--master', master, '--adapters'].concat(adapters, ['--weights'], weights);
    if (params.inPlace === true) {
        args.push('--in-place');
    } else {
        args.push(
            '--output',
            relativePath(
                params.output,
                'artifacts/finetune_lora_candidate',
                'output'
            )
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
        params.deployConfig,
        'deploy/lm-studio/config.toml',
        'deployConfig'
    );
    const args = [configPath];
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
