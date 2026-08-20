const shared = require('sharedFunctions');

const DEFAULT_PROJECT_ROOT = '/Users/eofmc/temp/gemma_extension';

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
    const value = params.projectRoot || DEFAULT_PROJECT_ROOT;
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
        smokeTest ? 'gemmaTrainSmokeTest' : 'gemmaTrainAdapter'
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
        'artifacts/gemma-project-lora-v2',
        'adapter'
    );
    return runScript(
        root,
        'scripts/verify_master.sh',
        [mode, adapter],
        'gemmaVerifyMaster'
    );
}

function mergeAdapters(params) {
    const root = projectRoot(params);
    const master = relativePath(
        params.master,
        'artifacts/gemma-project-lora-v2',
        'master'
    );
    const adapters = stringArray(
        params.adapters,
        [
            'artifacts/huawei-lora-adapter',
            'artifacts/quectel-lora-adapter'
        ],
        'adapters'
    ).map(function (item) {
        return relativePath(item, '', 'adapter');
    });
    const weights = stringArray(
        params.weights,
        ['0.3333333333333333', '0.3333333333333333', '0.3333333333333333'],
        'weights'
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
                'artifacts/gemma-project-lora-v2-candidate',
                'output'
            )
        );
    }
    if (params.force === true) {
        args.push('--force');
    }
    return runScript(root, 'scripts/merge_adapters.sh', args, 'gemmaMergeAdapters');
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
        replace ? 'gemmaLmStudioUpdate' : 'gemmaLmStudioInstall'
    );
}

const HANDLERS = {
    gemmaTrainAdapter: trainAdapter,
    gemmaVerifyMaster: verifyMaster,
    gemmaMergeAdapters: mergeAdapters,
    gemmaLmStudioInstall: function (params) { return deploy(params, false); },
    gemmaLmStudioUpdate: function (params) { return deploy(params, true); }
};

function toolEntry(sid, handlerName, jsonParams) {
    try {
        if (!Object.prototype.hasOwnProperty.call(HANDLERS, handlerName)) {
            return shared.error('Unknown Gemma project handler: ' + handlerName);
        }
        return HANDLERS[handlerName](parseParams(jsonParams));
    } catch (error) {
        return shared.error(error && error.message ? error.message : String(error));
    }
}

module.exports = { toolEntry };
