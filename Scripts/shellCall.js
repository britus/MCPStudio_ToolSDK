// ===================================================================
// Handler Function: shellCall
// Shell command wrapper for executing system commands
// Uses configurable shell and parameters array
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    console.log(message);
    stdOut.push(message);
}

/**
 * Execute a shell command with optional parameters
 * @param {Object} params - Command parameters
 * @param {string} params.command - Shell command to execute (required)
 * @param {Array<string>} [params.parameters=[]] - Array of command parameters (optional)
 * @param {string} [params.shell="/bin/bash"] - Shell interpreter path (/bin/sh or /bin/bash) (optional, default /bin/bash)
 */

function shellCall(params) {
    var command = params.command || "";
    var parameters = params.parameters || [];
    var shell = params.shell || "/bin/bash";
    
    taskLog("=== Shell Call Task ===");
    taskLog("Command: " + command);
    taskLog("Parameters: " + JSON.stringify(parameters));
    taskLog("Shell: " + shell);

    // Validate input parameters
    if (!command) {
        return shared.createErrorResult("Missing required parameter: command");
    }
    
    if (shell.length === 0) {
        shell = "/bin/bash";
    }

    var isCustomShell = false;
    
    // Build shell script based on function parameters
    // Parameter 3 : string : shell (/bin/sh /bin/bash)
    //  -> Optional -> default /bin/bash This is used at #! first line
    
    var shellScript = "#!/usr/bin/env bash\n";
    
    // Check if shell parameter differs from default - treat as custom shell
    if (shell !== "/bin/bash") {
        shellScript += shell + "\n";
        isCustomShell = true;
    } else {
        shellScript += "/bin/bash\n";
    }
    
    // Build command with parameters based on function parameters
    shellScript += 'set -euo pipefail\n';
    shellScript += "cd \"$(dirname \"$0\")\" || exit 1\n";

    if (parameters && parameters.length > 0) {
        taskLog("[Script] Building command with parameters...");
        
        var paramString = "";
        for (var i = 0; i < parameters.length; i++) {
            var arg = parameters[i];
            if (arg != null) {
                var argStr = String(arg);
                var escapedArg = argStr
                    .replace(/"/g, '\\"')
                    .replace(/\$/g, '\\$')
                    .replace(/`/g, '\\`');
                paramString += " \"" + escapedArg + "\"";
            } else {
                paramString += " \"\"";
            }
        }
        shellScript += 'exec ' + command + paramString + '\n';
    } else {
        // Single command without additional parameters
        shellScript += 'exec ' + command + '\n';
    }

    taskLog("[Script] Run: " + shellScript);
    
    var success = Swift.shell(shellScript);

    if (success) {
        Swift.setToolResult(JSON.stringify({
            text: "[Script] Command executed successfully\n" + 
                   stdOut.join("\n"),
            metadata: {
                path: "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/Scripts/",
                command: command,
                shell: shell,
                parameters: parameters,
                operation: "shellCall",
                success: true,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] Command successful!");
    } else {
        Swift.setToolResult(JSON.stringify({
            text: "[Script] Command failed with exit code " + exitCode + "\n" + 
                   stdOut.join("\n") + "\n--- Stderr ---\n" + 
                   (stdErr && stdErr.length > 0 ? stdErr.join("\n") : ""),
            metadata: {
                path: "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/Scripts/",
                command: command,
                shell: shell,
                parameters: parameters,
                operation: "shellCall",
                success: false,
                exitCode: exitCode,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] Command failed!");
    }

    return null; // Result already set via Swift.setToolResult
}

module.exports = {
    shellCall
};
