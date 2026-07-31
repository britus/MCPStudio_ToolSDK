# Python runtime plugin

`PythonRuntimeTool.bundle` is an ABI version 3 MCP Studio custom-tool plugin. It launches a Python process from an inline script or an absolute script path and returns a complete MCP tool-result object.

## Requirements

- macOS 15 or newer
- CMake 3.25 or newer, or Xcode
- A Python 3 executable available at a standard location, on the MCP Studio process `PATH`, or by explicit absolute path

## Build with CMake

From the SDK root:

```bash
cmake -S PythonRuntimePlugin -B PythonRuntimePlugin/build
cmake --build PythonRuntimePlugin/build
```

Products:

```text
PythonRuntimePlugin/build/bundle/PythonRuntimeTool.bundle
PythonRuntimePlugin/build/bundle/libToolJSONBridge.dylib
```

The post-build step copies `libToolJSONBridge.dylib` next to the bundle. Keep both products together because the bundle loads the bridge through `@loader_path/../../..`.

## Build with Xcode

```bash
xcodebuild \
  -project ToolSDK.xcodeproj \
  -scheme PythonRuntimeTool \
  -configuration Debug \
  build
```

The Xcode target depends on `ToolJSONBridge` and writes `libToolJSONBridge.dylib` beside the bundle in the Xcode products directory. Keep the library and bundle together so the configured `@loader_path/../../..` rpath can resolve it.

## MCP Studio configuration

Import or adapt `config/Tools/python_runtime.json`. It connects the public `python_runtime` tool to:

```json
{
  "toolType": "CustomTool",
  "pluginName": "PythonRuntimeTool",
  "execHandler": "PythonRuntimeTool",
  "execMethod": "toolEntry"
}
```

## Arguments

Supply either `scriptPath` or `inlineScript`:

```json
{
  "pythonExecutable": "/opt/homebrew/bin/python3",
  "scriptPath": "/absolute/path/to/tool.py",
  "scriptArguments": ["--flag", "value"],
  "workingDirectory": "/absolute/project/path",
  "stdin": "optional stdin text",
  "timeoutSeconds": 60,
  "resultMode": "capture"
}
```

| Field | Behavior |
|---|---|
| `pythonExecutable` | Optional. Empty searches common absolute locations and falls back to `python3` through `/usr/bin/env`; `python` or `python3` uses `/usr/bin/env` directly. Any other value must be an absolute path and is validated by the process launch so the result includes the real `launchError`. |
| `scriptPath` | Existing absolute Python file path. Required unless `inlineScript` is non-empty. |
| `inlineScript` | Python source passed to `python -c`; takes precedence over `scriptPath`. |
| `scriptArguments` | String-like values appended after the script. |
| `workingDirectory` | Existing absolute directory. Defaults to the script's directory, or the host's current directory for inline scripts. |
| `stdin` | Text written to standard input. Takes precedence over `stdinJSON`. |
| `stdinJSON` | JSON-serializable value encoded as one compact JSON document on standard input. |
| `timeoutSeconds` | Defaults to 60; non-positive values reset to 60; values above 600 are capped at 600. |
| `resultMode` | `capture` (default) or `toolResultJSON`. |

The handler also understands an `arguments` array as an additional script-argument alias, an `environment` object of child-process variables, and `passParamsToStdin`; these are implementation-level options not exposed by the shipped public tool schema. An explicit `environment.PATH` is used unchanged by `/usr/bin/env`; otherwise the handler prepends the common Homebrew and system binary directories to the host process `PATH`.

The plugin accepts arguments directly or inside a host envelope's `arguments` object. A dictionary-valued host `arguments` member is unwrapped before execution.

## Result modes

### `capture`

The plugin returns `success`, `exitCode`, `stdout`, `stderr`, `timedOut`, `outputLimitExceeded`, `maxOutputBytes`, the resolved executable, script/working paths, and result mode in `structuredContent`. A nonzero exit, timeout, launch failure, or output-limit violation sets `isError` to `true`.

Standard output and error share a 10 MiB capture limit. Exceeding it kills the process and sets `outputLimitExceeded`.

### `toolResultJSON`

The child must exit successfully and write exactly one JSON object to stdout with both:

- `content`: an array
- `structuredContent`: an object

The object is returned unchanged. Logging or any other bytes on stdout make parsing fail; send diagnostics to stderr instead.

Example child output:

```json
{
  "structuredContent": { "success": true, "message": "hello" },
  "content": [{ "type": "text", "text": "hello" }],
  "isError": false
}
```

## Examples

Run the capture example through the plugin with:

```json
{
  "pythonExecutable": "python3",
  "scriptPath": "/absolute/path/to/MCPStudio_ToolSDK/PythonRuntimePlugin/examples/echo_tool.py",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```

`examples/python_stdlib_tool.py` demonstrates Python standard-library access.

## Process behavior

- The child inherits the MCP Studio process environment, overlaid with values from `environment` when used.
- Changing the child `PATH` does not change which Python executable is selected; executable resolution happens first.
- On timeout the plugin sends normal termination, waits up to two seconds, then sends `SIGKILL` if needed.
- Non-UTF-8 output is replaced with a diagnostic that reports the byte count.
- Filesystem and process access remain subject to MCP Studio/plugin permissions and macOS sandbox rules.
