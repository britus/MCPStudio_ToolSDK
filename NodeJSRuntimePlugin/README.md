# Node.js runtime plugin

`NodeJSRuntimeTool.bundle` is an ABI version 3 MCP Studio custom-tool plugin. It launches a Node.js process from an inline script or an absolute script path and returns a complete MCP tool-result object.

## Requirements

- macOS 15 or newer
- CMake 3.25 or newer, or Xcode
- A Node.js executable available at a standard location, on the MCP Studio process `PATH`, or by explicit absolute path

## Build with CMake

From the SDK root:

```bash
cmake -S NodeJSRuntimePlugin -B NodeJSRuntimePlugin/build
cmake --build NodeJSRuntimePlugin/build
```

Products:

```text
NodeJSRuntimePlugin/build/bundle/NodeJSRuntimeTool.bundle
NodeJSRuntimePlugin/build/bundle/libToolJSONBridge.dylib
```

The post-build step copies `libToolJSONBridge.dylib` next to the bundle. Keep both products together because the bundle loads the bridge through `@loader_path/../../..`.

## Build with Xcode

```bash
xcodebuild \
  -project ToolSDK.xcodeproj \
  -scheme NodeJSRuntimeTool \
  -configuration Debug \
  build
```

The Xcode target depends on `ToolJSONBridge` and writes `libToolJSONBridge.dylib` beside the bundle in the Xcode products directory. Keep the library and bundle together so the configured `@loader_path/../../..` rpath can resolve it.

## MCP Studio configuration

Import or adapt `config/Tools/nodejs_runtime.json`. It connects the public `nodejs_runtime` tool to:

```json
{
  "toolType": "CustomTool",
  "pluginName": "NodeJSRuntimeTool",
  "execHandler": "NodeJSRuntimeTool",
  "execMethod": "toolEntry"
}
```

## Arguments

Supply either `scriptPath` or `inlineScript`:

```json
{
  "nodeExecutable": "/opt/homebrew/bin/node",
  "scriptPath": "/absolute/path/to/tool.js",
  "scriptArguments": ["--flag", "value"],
  "workingDirectory": "/absolute/project/path",
  "stdin": "optional stdin text",
  "timeoutSeconds": 60,
  "resultMode": "capture"
}
```

| Field | Behavior |
|---|---|
| `nodeExecutable` | Optional. Empty or `node` searches `/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`, then absolute directories on the host process `PATH`. Any other value must be an existing absolute executable path. |
| `scriptPath` | Existing absolute JavaScript file path. Required unless `inlineScript` is non-empty. |
| `inlineScript` | JavaScript source passed to `node -e`; takes precedence over `scriptPath`. |
| `scriptArguments` | String-like values appended after the script. |
| `workingDirectory` | Existing absolute directory. Defaults to the script's directory, or the host's current directory for inline scripts. |
| `stdin` | Text written to standard input. Takes precedence over `stdinJSON`. |
| `stdinJSON` | JSON-serializable value encoded as one compact JSON document on standard input. |
| `timeoutSeconds` | Defaults to 60; non-positive values reset to 60; values above 600 are capped at 600. |
| `resultMode` | `capture` (default) or `toolResultJSON`. |

The handler also understands an `arguments` array as an additional script-argument alias, an `environment` object of child-process variables, and `passParamsToStdin`; these are implementation-level options not exposed by the shipped public tool schema.

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
  "nodeExecutable": "node",
  "scriptPath": "/absolute/path/to/MCPStudio_ToolSDK/NodeJSRuntimePlugin/examples/echo_tool.js",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```

`examples/node_stdlib_tool.js` demonstrates Node.js standard-library access.

## Process behavior

- The child inherits the MCP Studio process environment, overlaid with values from `environment` when used.
- Changing the child `PATH` does not change which Node.js executable is selected; executable resolution happens first.
- On timeout the plugin sends normal termination, waits up to two seconds, then sends `SIGKILL` if needed.
- Non-UTF-8 output is replaced with a diagnostic that reports the byte count.
- Filesystem and process access remain subject to MCP Studio/plugin permissions and macOS sandbox rules.
