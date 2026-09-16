// ===================================================================
// Handler Function: shellCall
// Runs a shell command through a temporary script file.
// ===================================================================

const shared = require('sharedFunctions');

function resolveShell(shell) {
    var candidates = [];
    var i;
    var resolved;

    if (shell !== undefined && shell !== null && shell !== '') {
        if (typeof shell !== 'string' || shell.charAt(0) !== '/') {
            return {
                ok: false,
                message: 'shell must be an absolute path to a shell interpreter'
            };
        }
        return shared.resolveTool(shell, 'shell');
    }

    // macOS installs both shells by default. Prefer the current system shell,
    // then retain bash compatibility for installations without zsh.
    candidates = ['/bin/zsh', '/bin/bash'];
    for (i = 0; i < candidates.length; i += 1) {
        if (MCPStudio.fileExists(candidates[i])) {
            resolved = shared.resolveTool(candidates[i], 'shell');
            if (resolved.ok) {
                return resolved;
            }
        }
    }

    return {
        ok: false,
        message: 'No supported system shell found (/bin/zsh or /bin/bash)'
    };
}

function createTemporaryScriptPath() {
    var tempPath = MCPStudio.getTempPath();
    var suffix;

    if (typeof tempPath !== 'string' || tempPath.length === 0) {
        return { ok: false, message: 'Unable to determine the temporary directory' };
    }

    suffix = String(new Date().getTime()) + '-' +
        String(Math.floor(Math.random() * 1000000000));
    return shared.validateFilePath(
        shared.joinPath(tempPath, '.mcpstudio-shell-' + suffix + '.sh'),
        'temporary script path',
        { absolute: true }
    );
}

/**
 * Execute a shell command through a temporary script using the current macOS
 * system shell. Shell grammar such as pipes and redirections is intentionally
 * supported by this tool.
 *
 * @param {Object} params - Shell parameters
 * @param {string} params.command - Shell source to execute
 * @param {Array<string>} [params.parameters=[]] - Extra shell-quoted arguments
 * @param {string} [params.shell] - Absolute path to zsh or bash
 */
function shellCall(params) {
    params = params || {};

    var command = params.command || '';
    var parameters = params.parameters || [];
    var resolvedShell;
    var temporaryScript;
    var scriptSource;
    var run;
    var saved = false;
    var cleanupSucceeded = true;
    var i;

    if (typeof command !== 'string' || command.trim().length === 0) {
        return shared.setErrorResult('Missing required parameter: command', {
            operation: 'shellCall'
        });
    }
    if (command.indexOf('\0') >= 0) {
        return shared.setErrorResult('command contains an invalid NUL character', {
            operation: 'shellCall'
        });
    }
    if (!Array.isArray(parameters)) {
        return shared.setErrorResult('parameters must be an array', {
            operation: 'shellCall'
        });
    }
    for (i = 0; i < parameters.length; i += 1) {
        if (typeof parameters[i] !== 'string') {
            return shared.setErrorResult('parameters must contain only strings', {
                operation: 'shellCall'
            });
        }
    }

    resolvedShell = resolveShell(params.shell);
    if (!resolvedShell.ok) {
        return shared.setErrorResult(resolvedShell.message, {
            operation: 'shellCall',
            command: command
        });
    }

    temporaryScript = createTemporaryScriptPath();
    if (!temporaryScript.ok) {
        return shared.setErrorResult(temporaryScript.message, {
            operation: 'shellCall',
            command: command
        });
    }

    scriptSource = command;
    if (parameters.length > 0) {
        scriptSource += ' ';
        for (i = 0; i < parameters.length; i += 1) {
            scriptSource += shared.quoteShellArgument(parameters[i]);
            if (i + 1 < parameters.length) {
                scriptSource += ' ';
            }
        }
    }
    scriptSource += '\n';

    try {
        saved = MCPStudio.saveFile(temporaryScript.value, scriptSource) === true;
        if (!saved) {
            return shared.setErrorResult('Unable to create temporary shell script', {
                operation: 'shellCall',
                command: command,
                shell: resolvedShell.value
            });
        }

        run = shared.executeProcess(resolvedShell.value, [temporaryScript.value]);
    } catch (error) {
        run = {
            success: false,
            stdout: [],
            stderr: [error && error.message ? error.message : String(error)]
        };
    } finally {
        if (saved) {
            try {
                cleanupSucceeded = MCPStudio.deleteFile(temporaryScript.value) === true;
            } catch (error) {
                cleanupSucceeded = false;
            }
        }
    }

    if (!cleanupSucceeded) {
        run.stderr.push('Warning: unable to remove temporary shell script: ' + temporaryScript.value);
    }

    return shared.setProcessResult(
        run.success,
        'Shell command executed successfully.',
        'Shell command failed.',
        {
            command: command,
            shell: resolvedShell.value,
            operation: 'shellCall',
            temporaryScriptRemoved: cleanupSucceeded
        },
        run.stdout,
        run.stderr
    );
}

module.exports = {
    shellCall
};
