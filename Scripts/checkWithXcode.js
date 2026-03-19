// ===================================================================
// Handler Function: checkWithXcode
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function checkWithXcode(params) {
    var projectName = params.projectName;
    var projectDir= params.projectDir;
    
    console.log("Test with XCode: " + projectName);
    
    if (!Swift.fileExists(projectDir)) {
        return shared.createErrorResult("Project directory not found: " + projectDir);
    }
     
    var shellScript = '#!/bin/bash\n';
    shellScript += 'PROJECT_NAME="' + projectName + '"\n';
    shellScript += 'PROJECT_DIR="' + projectDir + '"\n';
    shellScript += 'cd "${PROJECT_DIR}" || exit 1\n';
    shellScript += 'xcodebuild -arch `uname -m` -alltargets -quiet -project "${PROJECT_NAME}" || exit 1\n';
    shellScript += 'exit 0\n';

   	var success = Swift.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
        	"Build failed:\n" + stdOut.join("\n") + stdErr.join("\n")) 
    }
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: "Compiled successfully.",
        metadata: {
	        path: projectDir,
	  		stdout: stdOut.join("\n"),
	   		stderr: stdErr.join("\n"),
            operation: "checkWithXcode",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	checkWithXcode
};