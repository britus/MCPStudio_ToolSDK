// ===================================================================
// Handler Function: checkWithXcode
// Builds Xcode projects with configurable options
// Fixed version - removes problematic shell script generation
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');
const builds = require('listXcodeBuilds');

function buildLog(message) {
    console.log(message);
    stdOut.push(message);
}

/**
 * Check and build project with Xcode using xcodebuild
 * @param {Object} params - Command parameters
 * @param {string} params.projectName - Name of the project (without .xcodeproj extension)
 * @param {string} params.projectDir - Absolute path to the project directory
 * @param {string} [params.scheme=""] - Scheme name (defaults to first scheme if empty)
 * @param {string} [params.configuration="Debug"] - Build configuration (Debug/Release/Profile)
 * @param {string} [params.platform="macosx"] - Target platform (macosx/iphoneos/iphonesimulator)
 * @param {boolean} [params.clean=false] - Clean build before building
 * @param {boolean} [params.showOperationLogs=false] - Show verbose operation logs
 */

function checkWithXcode(params) {
    var projectName = params.projectName || "";
    var projectDir = params.projectDir || "";
    
    buildLog("=== Xcode Build Task ===");
    buildLog("Project: " + projectName);
    buildLog("Directory: " + projectDir);

    // Validate input parameters
    if (!projectDir) {
        return shared.createErrorResult("Missing required parameter: projectDir");
    }
    
    if (!Swift.fileExists(projectDir)) {
        return shared.createErrorResult("Project directory not found: " + projectDir);
    }

    // Normalize project name (remove .xcodeproj extension if present)
    projectName = projectName.replace(/\.xcodeproj$/i, "");
    
    // Set default values from params
    var scheme = params.scheme || "";
    var configuration = params.configuration || "Debug";
    var platform = params.platform || "macosx";
    var codesign = params.codesign || "";
    var cleanBuild = (params.clean === true);
    var showOperationLogs = (params.showOperationLogs === true);

    buildLog("[Script] Scheme: " + scheme);
    buildLog("[Script] Configuration: " + configuration);
    buildLog("[Script] Platform: " + platform);
    buildLog("[Script] Clean Build: " + cleanBuild);
    buildLog("[Script] Show Operation Logs: " + showOperationLogs);
    buildLog("[Script] Team Identifier: " + codesign);

    var shellScript = '#!/bin/bash\n';
    var success = false

        // Clean build artifacts if requested
    if (cleanBuild) {
        shellScript += 'set -euo pipefail\n\n';
        shellScript += '# Clean previous build artifacts\n';
        shellScript += 'rm -rf DerivedData/ || true\n\n';
        buildLog("[Script] Cleaning previous builds...");
        
        success = Swift.shell(shellScript);
        if (!success) {
            return shared.createErrorResult("Failed to clean build directory");
        }
    }
    
    shellScript += 'set -euo pipefail\n';
    shellScript += 'PROJECT_NAME="' + projectName + '"\n';
    shellScript += 'PROJECT_DIR="' + projectDir + '"\n';
    shellScript += 'ARCH=`uname -m`\n';
    shellScript += 'cd "${PROJECT_DIR}" || exit 1\n';
    shellScript += 'xcodebuild';
    /* ADDITIONAL PARAMETERS FROM FUNCTION params */
    shellScript += ' -arch ${ARCH}';
    shellScript += ' -alltargets -quiet ';
    //shellScript += ' -quiet ';
    shellScript += ' -only-active-architectures';
	shellScript += ' -verbose -showDeps -showIcons';
   
    if (codesign.length > 0) {
    	shellScript += ' --codeSigningIdentity="' + codesign + '"';
	}
	
	/* PARAMETER-END */
    shellScript += ' -project "${PROJECT_NAME}.xcodeproj" || exit 1\n';
    shellScript += 'exit 0\n';

    buildLog("[Script] Run: " + shellScript);
       
    success = Swift.shell(shellScript);
     
		if (!success || stdErr.length > 0) {
			Swift.setToolResult(JSON.stringify({
		        text: "[Script] Build FAILED for " + projectName + "\n" + 
		               stdOut.join("\n") + 
		               (stdErr && stdErr.length > 0 
		               		? "\n--- Stderr ---\n" + stdErr.join("\n") 
		               		: ""),
		        metadata: {
            			path: projectDir,
            			projectName: projectName,
            			configuration: configuration,
            			platform: platform,
            			operation: "checkWithXcode",
            			codesign: codesign,
            			success: true,
            			stdout: stdOut,
            			stderr: stdErr,
            	}
		    }));
		    buildLog("[Script] Build failed!");
		}
		else {
			Swift.setToolResult(JSON.stringify({
		        text: "Build completed successfully for " + projectName + "\n" + 
		               stdOut.join("\n") + 
		               (stdErr && stdErr.length > 0 
		               		? "\n--- Stderr ---\n" + stdErr.join("\n") 
		               		: ""),
		                metadata: {
            				path: projectDir,
            				projectName: projectName,
            				configuration: configuration,
            				platform: platform,
            				operation: "checkWithXcode",
            				codesign: codesign,
            				success: true,
            				stdout: stdOut,
            				stderr: stdErr,
            			}
		    }));
		    buildLog("[Script] Build successful!");
		}

    return null; // Result already set via Swift.setToolResult
}

module.exports = {
    checkWithXcode
};
