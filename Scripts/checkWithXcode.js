// ===================================================================
// Handler Function: checkWithXcode
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function checkWithXcode(params) {
    var projectName = params.projectName;
    var projectDir = params.projectDir;
    //var projectHelper = "";
    
    console.log("Test with XCode: " + projectName);
    
    if (!Swift.fileExists(projectDir)) {
        return shared.createErrorResult("Project directory not found: " + projectDir);
    }
    
    /* Remove .xcodeproj */
	projectName = projectName.replace(".xcodeproj", "");
	//projectHelper = projectName + ".bash";
    
    var shellScript = '#!/bin/bash\n';
    shellScript += 'set -euo pipefail\n';
    shellScript += 'PROJECT_NAME="' + projectName + '"\n';
    shellScript += 'PROJECT_DIR="' + projectDir + '"\n';
    //shellScript += 'PROJECT_HELPER="' + projectHelper + '"\n';
    shellScript += 'ARCH=`uname -m`\n';
    shellScript += 'cd "${PROJECT_DIR}" || exit 1\n';
    shellScript += 'xcodebuild -arch ${ARCH} -alltargets -quiet ';
    shellScript += ' -project "${PROJECT_NAME}.xcodeproj" || exit 1\n';
    shellScript += 'exit 0\n';

    console.log("Run: " + shellScript);

  	var success = Swift.shell(shellScript);
    if (!success) {
        return shared.createErrorResult(
        	"Build failed:\n" + stdOut.join("\n") + stdErr.join("\n")) 
    }
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: "Build successfully.\n" + stdOut.join("\n") + stdErr.join("\n"),
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