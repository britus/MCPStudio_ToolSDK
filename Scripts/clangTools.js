// ===================================================================
// Handler Function: clangTools
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function clangCheckSyntax(params) {
    var sourceFile = params.sourceFile;
    
    console.log("clang: Check syntax: " + sourceFile);
    
    if (!Swift.fileExists(sourceFile)) {
        return shared.createErrorResult("Project directory not found: " + sourceFile);
    }
     
    var shellScript = '#!/bin/bash\n';
    shellScript += 'SOURCE_FILE="' + sourceFile + '"\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -fsyntax-only "$(basename "${SOURCE_FILE}")"\n';

   	var success = Swift.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
        	"Syntax check failed:\n" + stdOut.join("\n") + stdErr.join("\n")) 
    }
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: "Syntax check successfully.",
        metadata: {
	        fileName: sourceFile,
	  		stdout: stdOut.join("\n"),
	   		stderr: stdErr.join("\n"),
            operation: "clangCheckSyntax",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

function clangCompile(params) {
    var sourceFile = params.sourceFile;
    
    console.log("clang: Compile file: " + sourceFile);
    
    if (!Swift.fileExists(sourceFile)) {
        return shared.createErrorResult("Project directory not found: " + sourceFile);
    }
     
    var shellScript = '#!/bin/bash\n';
    shellScript += 'SOURCE_FILE="' + sourceFile + '"\n';
    shellScript += 'FILE_DIR=$(dirname "${SOURCE_FILE}")\n';
    shellScript += 'cd "${FILE_DIR}" || exit 1\n';
    shellScript += 'clang -fsyntax-only "$(basename "${SOURCE_FILE}")"\n';

   	var success = Swift.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
        	"Compiler failed:\n" + stdOut.join("\n") + stdErr.join("\n")) 
    }
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: "Compiled successfully.",
        metadata: {
	        fileName: sourceFile,
	  		stdout: stdOut.join("\n"),
	   		stderr: stdErr.join("\n"),
            operation: "clangCompile",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	clangCheckSyntax,
    clangCompile,
};
