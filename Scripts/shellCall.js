// ===================================================================
// Handler Function: shellCall
// Compatibility entry point for direct developer-tool execution.
// No command interpreter is started; arguments are passed verbatim.
// ===================================================================

const shared = require('sharedFunctions');

/**
 * Execute an approved developer tool with an argument array.
 * @param {Object} params - Process parameters
 * @param {string} params.command - Approved executable name or absolute path
 * @param {Array<string>} [params.parameters=[]] - Verbatim process arguments
 */
function shellCall(params) {
    params = params || {};

    var command = params.command || "";
    var parameters = params.parameters || [];
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

    resolved = shared.resolveDeveloperTool(command.trim(), "command");
    if (!resolved.ok) {
        return shared.setErrorResult(resolved.message, {
            operation: "shellCall",
            command: command
        });
    }

    parameters = (resolved.prefixArguments || []).concat(parameters);
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
