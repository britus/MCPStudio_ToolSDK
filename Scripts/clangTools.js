// ===================================================================
// Handler Function: clangTools
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Checks C/C++ source file syntax using clang -fsyntax-only
 * @param {Object} params - Command parameters
 * @param {string} params.sourceFile - Path to the source file to check (required)
 * @returns {null|null} Returns null after setting tool result with syntax check status
 */
function clangCheckSyntax(params) {
    params = params || {};
    var pathValidation = shared.validateFilePath(params.sourceFile || "", "sourceFile");
    var sourceFile;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "clangCheckSyntax"
        });
    }

    sourceFile = pathValidation.value;
    
    console.log("clang: Check syntax: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.setErrorResult("File not found: " + sourceFile, {
            operation: "clangCheckSyntax",
            fileName: sourceFile
        });
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'SOURCE_FILE=' + shared.quoteShellArgument(sourceFile) + '\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -fsyntax-only "$(basename "${SOURCE_FILE}")"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.setProcessResult(false, "", "Syntax check failed.", {
            fileName: sourceFile,
            operation: "clangCheckSyntax"
        });
    }
    
    // Set result using MCPStudio bridge
    return shared.setProcessResult(true, "Syntax check succeeded.", "", {
        fileName: sourceFile,
        operation: "clangCheckSyntax"
    });
}

/**
 * Compiles a C/C++ source file using clang compiler
 * @param {Object} params - Command parameters
 * @param {string} params.sourceFile - Path to the source file to compile (required)
 * @returns {null|null} Returns null after setting tool result with compilation status
 */
function clangCompile(params) {
    params = params || {};
    var pathValidation = shared.validateFilePath(params.sourceFile || "", "sourceFile");
    var sourceFile;
    var fileName;
    var extensionIndex;
    var outputName;
    var outputFile;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "clangCompile"
        });
    }

    sourceFile = pathValidation.value;
    fileName = sourceFile.substring(sourceFile.lastIndexOf("/") + 1);
    extensionIndex = fileName.lastIndexOf(".");
    outputName = (extensionIndex > 0 ? fileName.substring(0, extensionIndex) : fileName) + ".o";
    outputFile = sourceFile.substring(0, sourceFile.length - fileName.length) + outputName;
    
    console.log("clang: Compile file: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.setErrorResult("File not found: " + sourceFile, {
            operation: "clangCompile",
            fileName: sourceFile
        });
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'SOURCE_FILE=' + shared.quoteShellArgument(sourceFile) + '\n';
    shellScript += 'OUTPUT_FILE=' + shared.quoteShellArgument(outputName) + '\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -c "$(basename "${SOURCE_FILE}")" -o "${OUTPUT_FILE}"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.setProcessResult(false, "", "Compilation failed.", {
            fileName: sourceFile,
            outputFile: outputFile,
            operation: "clangCompile"
        });
    }
    
    // Set result using MCPStudio bridge
    return shared.setProcessResult(true, "Compilation succeeded.", "", {
        fileName: sourceFile,
        outputFile: outputFile,
        operation: "clangCompile"
    });
}

/**
 * Builds a project using Unix make with the specified Makefile
 * @param {Object} params - Command parameters
 * @param {string} params.makeFile - Path to the Makefile to use (required)
 * @returns {null|null} Returns null after setting tool result with build status
 */
function clangMake(params) {
    params = params || {};
    console.log("clang: --[MAKE]----------------------\n" 
                + JSON.stringify(params, null, 2));
    
    var pathValidation = shared.validateFilePath(params.makeFile || "", "makeFile");
    var sourceFile;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "clangMake"
        });
    }

    sourceFile = pathValidation.value;
    
    console.log("clang: Build with make file: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.setErrorResult("File not found: " + sourceFile, {
            operation: "clangMake",
            fileName: sourceFile
        });
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'MAKE_FILE=' + shared.quoteShellArgument(sourceFile) + '\n';
    shellScript += 'FILE_DIR=$(dirname "${MAKE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'make -j8 -f "$(basename "${MAKE_FILE}")"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.setProcessResult(false, "", "Build failed.", {
            fileName: sourceFile,
            operation: "clangMake"
        });
    }
    
    // Set result using MCPStudio bridge
    return shared.setProcessResult(true, "Build succeeded.", "", {
        fileName: sourceFile,
        operation: "clangMake"
    });
}

module.exports = {
	clangCheckSyntax,
    clangCompile,
    clangMake,
};
