// ===================================================================
// Handler Function: checkWithXcode
// Direct process-based Xcode project build.
// ===================================================================

const shared = require('sharedFunctions');

function checkWithXcode(params) {
    params = params || {};

    var projectName = params.projectName || "";
    var projectDir = params.projectDir || "";
    var scheme = params.scheme || "";
    var configuration = params.configuration || "Debug";
    var platform = params.platform || "macosx";
    var developmentTeam = params.codesign || "";
    var codeSigningIdentity = params.codeSigningIdentity || "";
    var cleanBuild = params.clean === true;
    var showOperationLogs = params.showOperationLogs === true;
    var alltargets = params.alltargets === true;
    var archive = params.archive === true;
    var onlyActiveArchs = params.onlyActiveArchs === true;
    var derivedDataPath = params.derivedDataPath || "";
    var dirValidation;
    var derivedValidation;
    var optionValues;
    var optionNames;
    var i;
    var projectPath;
    var executableValidation;
    var args = [];
    var run;

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
        return shared.setErrorResult(dirValidation.message, { operation: "checkWithXcode" });
    }
    projectDir = dirValidation.value;
    if (!MCPStudio.fileExists(projectDir)) {
        return shared.setErrorResult("Project directory not found: " + projectDir, {
            operation: "checkWithXcode",
            path: projectDir
        });
    }

    projectName = projectName.trim().replace(/\.xcodeproj$/i, "");
    if (/[\/\\\0\r\n]/.test(projectName)) {
        return shared.setErrorResult("projectName must be a project name, not a path", {
            operation: "checkWithXcode",
            path: projectDir
        });
    }
    optionValues = [scheme, configuration, platform, developmentTeam, codeSigningIdentity];
    optionNames = ["scheme", "configuration", "platform", "codesign", "codeSigningIdentity"];
    for (i = 0; i < optionValues.length; i += 1) {
        if (typeof optionValues[i] !== "string" || /[\0\r\n]/.test(optionValues[i])) {
            return shared.setErrorResult(optionNames[i] + " must be a single-line string", {
                operation: "checkWithXcode",
                path: projectDir
            });
        }
    }

    if (derivedDataPath) {
        derivedValidation = shared.validateDirectoryPath(
            derivedDataPath,
            "derivedDataPath",
            { absolute: true }
        );
        if (!derivedValidation.ok) {
            return shared.setErrorResult(derivedValidation.message, {
                operation: "checkWithXcode",
                path: projectDir
            });
        }
        derivedDataPath = derivedValidation.value;
    }

    projectPath = shared.joinPath(projectDir, projectName + ".xcodeproj");
    if (!MCPStudio.fileExists(projectPath)) {
        return shared.setErrorResult("Xcode project not found: " + projectPath, {
            operation: "checkWithXcode",
            path: projectPath
        });
    }
    executableValidation = shared.resolveDeveloperTool("xcodebuild", "xcodebuild", [
        "/usr/bin/xcodebuild"
    ]);
    if (!executableValidation.ok) {
        return shared.setErrorResult(executableValidation.message, {
            operation: "checkWithXcode",
            path: projectDir
        });
    }

    if (!showOperationLogs) {
        args.push("-quiet");
    }
    args.push("-project", projectPath);
    if (alltargets) {
        args.push("-alltargets");
    }
    if (scheme.length > 0) {
        args.push("-scheme", scheme);
    }
    if (platform.length > 0) {
        args.push("-sdk", platform);
    }
    if (configuration.length > 0) {
        args.push("-configuration", configuration);
    }
    if (derivedDataPath) {
        args.push("-derivedDataPath", derivedDataPath);
    }
    if (onlyActiveArchs) {
        args.push("ONLY_ACTIVE_ARCH=YES");
    }
    if (developmentTeam.length > 0) {
        args.push("DEVELOPMENT_TEAM=" + developmentTeam);
    }
    if (codeSigningIdentity.length > 0) {
        args.push("CODE_SIGN_IDENTITY=" + codeSigningIdentity);
    }
    if (developmentTeam.length === 0 && codeSigningIdentity.length === 0) {
        args.push("CODE_SIGNING_ALLOWED=NO");
    }
    if (cleanBuild) {
        args.push("clean");
    }
    args.push(archive ? "archive" : "build");

    run = shared.executeProcess(executableValidation.value, args);
    return shared.setProcessResult(
        run.success,
        (archive ? "Archive" : "Build") + " completed successfully for " + projectName + ".",
        (archive ? "Archive" : "Build") + " failed for " + projectName + ".",
        {
            path: projectDir,
            projectName: projectName,
            configuration: configuration,
            platform: platform,
            operation: "checkWithXcode",
            archive: archive,
            executable: executableValidation.value
        },
        run.stdout,
        run.stderr
    );
}

module.exports = {
    checkWithXcode
};
