// ===================================================================
// Handler Function: getGccInfo
// Direct process-based basic GCC compiler information.
// ===================================================================

const shared = require('sharedFunctions');

function getGccInfo(params) {
    params = params || {};

    var compiler = params.compiler || "gcc";
    var compilerName = compiler.substring(compiler.lastIndexOf("/") + 1);
    /* NOTE!: Security Gate: Allow only following path's */
    var resolved = shared.resolveDeveloperTool(compiler, "compiler", [
        "/usr/bin/" + compiler,
        "/opt/homebrew/bin/" + compiler,
        "/usr/local/bin/" + compiler
    ]);
    var output = shared.createProcessOutput();
    var versionRun;
    var targetRun;
    var dumpVersionRun;

    if (compilerName !== "gcc" && compilerName !== "g++") {
        return shared.setErrorResult("compiler must resolve to gcc or g++", {
            operation: "getGccInfo",
            compiler: compiler
        });
    }
    if (!resolved.ok) {
        return shared.setErrorResult(resolved.message, {
            operation: "getGccInfo",
            compiler: compiler
        });
    }

    versionRun = shared.executeProcess(resolved.value, ["--version"]);
    shared.appendProcessRun(output, "Basic Version Information", versionRun);
    if (!versionRun.success) {
        return shared.setProcessResult(false, "", "Failed to collect basic GCC information.", {
            path: resolved.value,
            compiler: compiler,
            operation: "getGccInfo"
        }, output.stdout, output.stderr);
    }

    output.stdout.push("=== Compiler Location ===", resolved.value);
    targetRun = shared.executeProcess(resolved.value, ["-dumpmachine"]);
    shared.appendProcessRun(output, "Target Architecture", targetRun);
    dumpVersionRun = shared.executeProcess(resolved.value, ["-dumpversion"]);
    shared.appendProcessRun(output, "Compiler Version", dumpVersionRun);

    return shared.setProcessResult(
        true,
        "Basic GCC information collected successfully.",
        "Failed to collect basic GCC information.",
        {
            path: resolved.value,
            compiler: compiler,
            executable: resolved.value,
            operation: "getGccInfo"
        },
        output.stdout,
        output.stderr
    );
}

module.exports = {
    getGccInfo
};
