// ===================================================================
// Handler Function: gccSettings
// Direct process-based GCC settings and capability inspection.
// ===================================================================

const shared = require('sharedFunctions');

function filteredRun(run, pattern, fallback) {
    var filtered;
    if (!run || !Array.isArray(run.stdout)) {
        return run;
    }
    filtered = run.stdout.filter(function(line) { return pattern.test(line); });
    run.stdout = filtered.length > 0 ? filtered : [fallback];
    return run;
}

function appendFlagProbe(output, executable, label, language, flag) {
    var run = shared.executeProcess(executable, [
        flag,
        "-fsyntax-only",
        "-x", language,
        "/dev/null"
    ]);
    run.stdout.unshift(flag + (run.success ? " supported" : " not available"));
    shared.appendProcessRun(output, label, run);
}

function gccSettings(params) {
    params = params || {};

    var compiler = params.compiler || "gcc";
    var verbose = params.verbose === true;
    var requestedCompilerName = compiler.substring(compiler.lastIndexOf("/") + 1);
    var resolved = shared.resolveDeveloperTool(compiler, "compiler", [
        "/usr/bin/" + compiler,
        "/opt/homebrew/bin/" + compiler,
        "/usr/local/bin/" + compiler
    ]);
    var output = shared.createProcessOutput();
    var compilerName;
    var language;
    var versionRun;
    var run;

    if (requestedCompilerName !== "gcc" && requestedCompilerName !== "g++") {
        return shared.setErrorResult("compiler must resolve to gcc or g++", {
            operation: "gccSettings",
            compiler: compiler
        });
    }
    if (!resolved.ok) {
        return shared.setErrorResult(resolved.message, {
            operation: "gccSettings",
            compiler: compiler
        });
    }

    compilerName = resolved.value.substring(resolved.value.lastIndexOf("/") + 1);
    language = compilerName === "g++" ? "c++" : "c";
    versionRun = shared.executeProcess(resolved.value, ["--version"]);
    shared.appendProcessRun(output, "Version Information", versionRun);
    if (!versionRun.success) {
        return shared.setProcessResult(false, "", "GCC settings detection failed.", {
            path: resolved.value,
            compiler: compiler,
            operation: "gccSettings"
        }, output.stdout, output.stderr);
    }

    run = shared.executeProcess(resolved.value, ["-dM", "-E", "-x", language, "/dev/null"]);
    filteredRun(
        run,
        language === "c++" ? /__cplusplus|_GLIBCXX/i : /__STDC_VERSION__/i,
        language === "c++" ? "C++ standard version not detected" : "C standard version not detected"
    );
    shared.appendProcessRun(output, "Language Standard", run);

    appendFlagProbe(output, resolved.value, "Optimization Support", language, "-O3");
    appendFlagProbe(output, resolved.value, "Debug Support", language, "-g");
    appendFlagProbe(output, resolved.value, "PIC Support", language, "-fPIC");
    appendFlagProbe(output, resolved.value, "PIE Support", language, "-fPIE");
    appendFlagProbe(output, resolved.value, "Thin LTO Support", language, "-flto=thin");
    appendFlagProbe(output, resolved.value, "Stack Protection", language, "-fstack-protector-strong");

    if (language === "c++") {
        appendFlagProbe(output, resolved.value, "C++ Exceptions", language, "-fexceptions");
        appendFlagProbe(output, resolved.value, "C++ RTTI", language, "-frtti");
    }

    run = shared.executeProcess(resolved.value, ["-print-file-name=include"]);
    shared.appendProcessRun(output, "Include Path", run);
    run = shared.executeProcess(resolved.value, ["-print-search-dirs"]);
    shared.appendProcessRun(output, "Library and Program Search Paths", run);
    run = shared.executeProcess(resolved.value, ["-Wl,--version"]);
    if (run.stdout.length > 5) {
        run.stdout = run.stdout.slice(0, 5);
    }
    shared.appendProcessRun(output, "Linker Information", run);
    run = shared.executeProcess(resolved.value, ["-dumpmachine"]);
    shared.appendProcessRun(output, "Target Architecture", run);
    run = shared.executeProcess(resolved.value, ["-dumpversion"]);
    shared.appendProcessRun(output, "Compiler Version", run);

    if (verbose) {
        output.stdout.push("=== Process Mode ===", "Direct argument-array execution through MCPStudio.process");
    }

    return shared.setProcessResult(
        true,
        "GCC settings detection completed successfully.",
        "GCC settings detection failed.",
        {
            path: resolved.value,
            compiler: compiler,
            executable: resolved.value,
            verbose: verbose,
            operation: "gccSettings"
        },
        output.stdout,
        output.stderr
    );
}

module.exports = {
    gccSettings
};
