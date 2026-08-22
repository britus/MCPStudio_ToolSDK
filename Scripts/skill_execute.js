// ===================================================================
// skill_execute.js
// Executes one approved developer tool for an authorized MCP Studio Skill.
// ===================================================================

const shared = require('sharedFunctions');

function skillExecute(params) {
    params = params || {};

    var command = params.command || "";
    var parameters = params.parameters || [];
    var operation = params.operation || "skillExecute";
    var resolved;
    var run;
    var i;

    if (typeof command !== "string" || command.trim().length === 0) {
        return shared.setErrorResult("Missing required parameter: command", {
            operation: operation
        });
    }
    if (!Array.isArray(parameters)) {
        return shared.setErrorResult("parameters must be an array", {
            operation: operation
        });
    }
    for (i = 0; i < parameters.length; i += 1) {
        if (typeof parameters[i] !== "string") {
            return shared.setErrorResult("parameters must contain only strings", {
                operation: operation
            });
        }
    }

    /* NOTE!: Security Gate: Allow only following path's */
    resolved = shared.resolveTool(command.trim(), "command");
    if (!resolved.ok) {
        return shared.setErrorResult(resolved.message, {
            operation: operation,
            command: command
        });
    }

    parameters = (resolved.prefixArguments || []).concat(parameters);
    run = shared.executeProcess(resolved.value, parameters);
    return shared.setProcessResult(
        run.success,
        "Skill process executed successfully.",
        "Skill process failed.",
        {
            operation: operation,
            command: command,
            executable: resolved.value,
            delegatedTool: resolved.requestedExecutable || ""
        },
        run.stdout,
        run.stderr
    );
}

module.exports = {
    skillExecute
};
