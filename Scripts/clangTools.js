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
    var sourceFile = params.sourceFile;
    
    console.log("clang: Check syntax: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.createErrorResult("File not found: " + sourceFile);
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'SOURCE_FILE="' + sourceFile + '"\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -fsyntax-only "$(basename "${SOURCE_FILE}")"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
            "Syntax check failed:\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""));
    }
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: "Syntax check successfully.\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
        metadata: {
            fileName: sourceFile,
            stdout: stdOut.join("\n"),
            stderr: stdErr.join("\n"),
            operation: "clangCheckSyntax",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

/**
 * Compiles a C/C++ source file using clang compiler
 * @param {Object} params - Command parameters
 * @param {string} params.sourceFile - Path to the source file to compile (required)
 * @returns {null|null} Returns null after setting tool result with compilation status
 */
function clangCompile(params) {
    var sourceFile = params.sourceFile;
    
    console.log("clang: Compile file: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.createErrorResult("File not found: " + sourceFile);
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'SOURCE_FILE="' + sourceFile + '"\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -fsyntax-only "$(basename "${SOURCE_FILE}")"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
            "Compiler failed:\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""));
    }
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: "Compiled successfully.\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
        metadata: {
            fileName: sourceFile,
            stdout: stdOut.join("\n"),
            stderr: stdErr.join("\n"),
            operation: "clangCompile",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

/**
 * Builds a project using Unix make with the specified Makefile
 * @param {Object} params - Command parameters
 * @param {string} params.makeFile - Path to the Makefile to use (required)
 * @returns {null|null} Returns null after setting tool result with build status
 */
function clangMake(params) {
    console.log("clang: --[MAKE]----------------------\n" 
                + JSON.stringify(params, null, 2));
    
    var sourceFile = params.makeFile;
    
    console.log("clang: Build with make file: " + sourceFile);
    
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.createErrorResult("File not found: " + sourceFile);
    }
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'MAKE_FILE="' + sourceFile + '"\n';
    shellScript += 'FILE_DIR=$(dirname "${MAKE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'make -j8 -f "$(basename "${MAKE_FILE}")"\n';

    var success = MCPStudio.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
            "Build failed:\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""));
    }
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: "Build successfully.\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
        metadata: {
            fileName: sourceFile,
            stdout: stdOut.join("\n"),
            stderr: stdErr.join("\n"),
            operation: "clangMake",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	clangCheckSyntax,
    clangCompile,
    clangMake,
};
