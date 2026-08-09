// ===================================================================
// Handler Function: shellCall
// Shell command wrapper for executing system commands
// Uses configurable shell and parameters array
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    shared.appendStandardOutput(message);
}

/**
 * Execute a shell command with optional parameters
 * @param {Object} params - Command parameters
 * @param {string} params.command - Shell command to execute (required)
 * @param {Array<string>} [params.parameters=[]] - Array of command parameters (optional)
 * @param {string} [params.shell="/bin/bash"] - Shell interpreter path (/bin/sh or /bin/bash) (optional, default /bin/bash)
 */

function shellCall(params) {
    params = params || {};

    var command = params.command || "";
    var parameters = params.parameters || [];
    var shell = params.shell || "/bin/bash";
    var shellValidation;
    
    taskLog("=== Shell Call Task ===");
    taskLog("Shell: " + shell);

    // Validate input parameters
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
    
    if (shell.length === 0) {
        shell = "/bin/bash";
    }

    shellValidation = shared.validateFilePath(shell, "shell", { absolute: true });
    if (!shellValidation.ok) {
        return shared.setErrorResult(shellValidation.message, {
            operation: "shellCall"
        });
    }

    shell = shellValidation.value;

    if (shell !== "/bin/bash" && shell !== "/bin/sh") {
        return shared.setErrorResult("shell must be /bin/bash or /bin/sh", {
            operation: "shellCall",
            shell: shell
        });
    }

    // MCPStudio executes this content as a temporary script, so the selected
    // interpreter belongs in the one and only shebang.
    var shellScript = "#!" + shell + "\n";
    
    // Build command with parameters based on function parameters
    shellScript += shell === "/bin/sh" ? 'set -eu\n' : 'set -euo pipefail\n';
    shellScript += 'export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:.venv/bin:${HOME}/bin:.\n';
    shellScript += 'cd \"$(dirname \"$0\")\" || exit 1\n';
    shellScript += 'if [ -n "${QTDIR:-}" ] && [ -d "$QTDIR" ]; then\n'
    shellScript += 'export PATH="$QTDIR/bin:$PATH"\n'
    shellScript += 'fi\n'
    shellScript += 'if [ -n "${CHAT_PROJECT_DIR:-}" ] && [ -d "$CHAT_PROJECT_DIR" ]; then\n'
    shellScript += 'export PATH="$CHAT_PROJECT_DIR/bin:$PATH"\n'
    shellScript += 'fi\n'

    shellScript += 'echo "Current path: $(pwd)"\n';
    
    if (parameters && parameters.length > 0) {
        var paramString = "";
        for (var i = 0; i < parameters.length; i++) {
            var arg = parameters[i];
            if (arg != null) {
                paramString += " " + shared.quoteShellArgument(arg);
            } else {
                return shared.setErrorResult("parameters must not contain null values", {
                    operation: "shellCall"
                });
            }
        }
        shellScript += command.trim() + paramString + '\n';
    } else {
        // Single command without additional parameters
        shellScript += command + '\n';
    }

    var success = MCPStudio.shell(shellScript);

    return shared.setProcessResult(
        success,
        "Command executed successfully.",
        "Command failed.",
        {
            path: ".",
            command: command,
            shell: shell,
            operation: "shellCall"
        }
    );
}

module.exports = {
    shellCall
};
