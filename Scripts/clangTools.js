// ===================================================================
// Handler Function: clangTools
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

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
