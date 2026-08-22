// ===================================================================
// Handler Function: shellCall
// Compatibility entry point for direct developer-tool execution.
// No command interpreter is started; arguments are passed verbatim.
// ===================================================================

const shared = require('sharedFunctions');

/**
 * Execute an approved developer tool with an argument array.
 * @param {Object} params - Process parameters
 * @param {string} params.command - Approved executable or compact invocation
 * @param {Array<string>} [params.parameters=[]] - Verbatim process arguments
 */
function shellCall(params) {
    params = params || {};

    var command = params.command || "";
    var parameters = params.parameters || [];
    var commandParts;
    var resolved;
    var run;
    var i;

    if (typeof command !== "string" || command.trim().length === 0) {
        return shared.setErrorResult("Missing required parameter: command", {
            operation: "shellCall"
        });
    }
    if (!Array.isArray(parameters)) {
        return shared.setErrorResult("parameters must be an array", {
            operation: "shellCall"
        });
    }
    for (i = 0; i < parameters.length; i += 1) {
        if (typeof parameters[i] !== "string") {
            return shared.setErrorResult("parameters must contain only strings", {
                operation: "shellCall"
            });
        }
    }

    // Preserve executable paths containing whitespace by resolving the entire
    // value first. If that fails, accept the common compact form
    // `command: "git status --short"` as a compatibility convenience.
    // splitArgumentString rejects shell control characters and only separates
    // on whitespace; no shell is invoked.
    commandParts = { ok: true, value: [command.trim()] };
    resolved = shared.resolveTool(commandParts.value[0], "command");
    if (!resolved.ok && /\s/.test(command.trim())) {
        commandParts = shared.splitArgumentString(command, "command");
        if (!commandParts.ok) {
            return shared.setErrorResult(commandParts.message, {
                operation: "shellCall",
                command: command
            });
        }
        resolved = shared.resolveTool(commandParts.value[0], "command");
    }

    if (!resolved.ok) {
        return shared.setErrorResult(resolved.message, {
            operation: "shellCall",
            command: command
        });
    }

    parameters = (resolved.prefixArguments || [])
        .concat(commandParts.value.slice(1), parameters);
    run = shared.executeProcess(resolved.value, parameters);
    return shared.setProcessResult(
        run.success,
        "Command executed successfully.",
        "Command failed.",
        {
            command: command,
            executable: resolved.value,
            delegatedTool: resolved.requestedExecutable || "",
            operation: "shellCall"
        },
        run.stdout,
        run.stderr
    );
}

module.exports = {
    shellCall
};
