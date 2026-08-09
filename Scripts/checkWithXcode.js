// ===================================================================
// Handler Function: checkWithXcode
// Builds Xcode projects with configurable options
// Fixed version - removes problematic shell script generation
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    shared.appendStandardOutput(message);
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
    params = params || {};
    var projectName = params.projectName || "";
    var projectDir = params.projectDir || "";
    var dirValidation;
    
    taskLog("=== Xcode Build Task ===");
    taskLog("Project: " + projectName);
    taskLog("Directory: " + projectDir);

    // Validate input parameters
    if (!projectDir) {
        return shared.setErrorResult("Missing required parameter: projectDir", {
            operation: "checkWithXcode"
        });
    }

    if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return shared.setErrorResult("Missing required parameter: projectName", {
            operation: "checkWithXcode"
        });
    }

    dirValidation = shared.validateDirectoryPath(projectDir, "projectDir", { absolute: true });
    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "checkWithXcode"
        });
    }

    projectDir = dirValidation.value;
    
    if (!MCPStudio.fileExists(projectDir)) {
        return shared.setErrorResult("Project directory not found: " + projectDir, {
            operation: "checkWithXcode",
            path: projectDir
        });
    }

    // Normalize project name (remove .xcodeproj extension if present)
    projectName = projectName.trim().replace(/\.xcodeproj$/i, "");
    if (/[\/\\\0\r\n]/.test(projectName)) {
        return shared.setErrorResult("projectName must be a project name, not a path", {
            operation: "checkWithXcode",
            path: projectDir
        });
    }
    
    // Set default values from params
    var scheme = params.scheme || "";
    var configuration = params.configuration || "Debug";
    var platform = params.platform || "macosx";
    var developmentTeam = params.codesign || "";
    var codeSigningIdentity = params.codeSigningIdentity || "";
    var cleanBuild = (params.clean === true);
    var showOperationLogs = (params.showOperationLogs === true);
    var alltargets = (params.alltargets === true);
    var archive = (params.archive === true);
    var onlyActiveArchs = (params.onlyActiveArchs === true);
    var derivedDataPath = params.derivedDataPath || "";
    var derivedDataValidation;
    var optionValues = [scheme, configuration, platform, developmentTeam, codeSigningIdentity];
    var optionNames = ["scheme", "configuration", "platform", "codesign", "codeSigningIdentity"];
    var optionIndex;

    for (optionIndex = 0; optionIndex < optionValues.length; optionIndex += 1) {
        if (typeof optionValues[optionIndex] !== "string") {
            return shared.setErrorResult(optionNames[optionIndex] + " must be a string", {
                operation: "checkWithXcode",
                path: projectDir
            });
        }
    }

    if (derivedDataPath) {
        derivedDataValidation = shared.validateDirectoryPath(
            derivedDataPath,
            "derivedDataPath",
            { absolute: true }
        );
        if (!derivedDataValidation.ok) {
            return shared.setErrorResult(derivedDataValidation.message, {
                operation: "checkWithXcode",
                path: projectDir
            });
        }
        derivedDataPath = derivedDataValidation.value;
    }

    taskLog("[Script] Scheme: " + scheme);
    taskLog("[Script] Configuration: " + configuration);
    taskLog("[Script] Platform: " + platform);
    taskLog("[Script] Clean Build: " + cleanBuild);
    taskLog("[Script] Show Operation Logs: " + showOperationLogs);
    taskLog("[Script] Team Identifier: " + developmentTeam);

    var shellScript = '#!/bin/bash\n';
    var success = false;
    
    // get notified
    shellScript += 'set -euo pipefail\n';

    shellScript += 'PROJECT_NAME=' + shared.quoteShellArgument(projectName) + '\n';
    shellScript += 'PROJECT_DIR=' + shared.quoteShellArgument(projectDir) + '\n';
    shellScript += 'ARCH=$(uname -m)\n';
    shellScript += 'cd "${PROJECT_DIR}" || exit 1\n';
    shellScript += 'xcodebuild';

    /* less context output unless detailed operation logs were requested */
    if (!showOperationLogs) {
        shellScript += ' -quiet';
    }

    /* Use only valid xcodebuild parameters */
    shellScript += ' -project "${PROJECT_NAME}.xcodeproj"';
    
    /* additional xcodebuild params */
    shellScript += ' -arch ${ARCH}';

    if (alltargets === true) {
        shellScript += ' -alltargets ';
    }
    
    if (scheme.length > 0) {
        shellScript += ' -scheme ' + shared.quoteShellArgument(scheme);
    }
    if (platform.length > 0) {
        shellScript += ' -sdk ' + shared.quoteShellArgument(platform);
    }
    // Fixed: check if configuration is not empty string instead of numeric comparison
    if (configuration && configuration.length > 0) {
        shellScript += ' -configuration ' + shared.quoteShellArgument(configuration);
    }
    if (derivedDataPath) {
        shellScript += ' -derivedDataPath ' + shared.quoteShellArgument(derivedDataPath);
    }
    if (onlyActiveArchs) {
        shellScript += ' ONLY_ACTIVE_ARCH=YES';
    }
    if (developmentTeam.length > 0) {
        shellScript += ' DEVELOPMENT_TEAM=' + shared.quoteShellArgument(developmentTeam);
    }
    if (codeSigningIdentity.length > 0) {
        shellScript += ' CODE_SIGN_IDENTITY=' + shared.quoteShellArgument(codeSigningIdentity);
    }
    /* end */
    if (developmentTeam.length === 0 && codeSigningIdentity.length === 0) {
        shellScript += ' CODE_SIGNING_ALLOWED=NO';
    }
    if (cleanBuild) {
        shellScript += ' clean';
    }
    if (archive) {
        shellScript += ' archive || exit 1\n';
    } else {
        shellScript += ' build || exit 1\n';
    }
    shellScript += 'exit 0\n';

    success = MCPStudio.shell(shellScript);

    return shared.setProcessResult(
        success,
        (archive ? "Archive" : "Build") + " completed successfully for " + projectName + ".",
        (archive ? "Archive" : "Build") + " failed for " + projectName + ".",
        {
            path: projectDir,
            projectName: projectName,
            configuration: configuration,
            platform: platform,
            operation: "checkWithXcode",
            archive: archive
        }
    );
}

module.exports = {
    checkWithXcode
};
