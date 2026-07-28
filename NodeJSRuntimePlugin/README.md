# NodeJS Runtime Plugin

`NodeJSRuntimeTool.bundle` is an MCP Studio ToolSDK plugin that runs JavaScript with a Node.js executable and returns stdout, stderr, and the process exit code as an MCP tool result.

## Build

```bash
cd ~/toolsdk/NodeJSRuntimePlugin
mkdir -p build
cd build
cmake ..
make
```

The bundle is produced at:

```text
build/bundle/NodeJSRuntimeTool.bundle
```

## Tool Arguments

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

`nodeExecutable` is optional. If omitted or set to `node`, the plugin resolves
an absolute executable from common Homebrew locations and the MCP Studio
process environment. The child `environment.PATH` does not change which
executable is launched. Other values must be existing absolute executable
paths.

`scriptPath` is required unless `inlineScript` is provided.

`workingDirectory`, when supplied, must be an existing absolute directory.

`timeoutSeconds` defaults to 60 seconds and is capped at 600 seconds.

Captured stdout and stderr share a 10 MiB limit. Exceeding it terminates the
process and returns `outputLimitExceeded: true`.

`resultMode` supports:

- `capture`: package stdout, stderr, exitCode, and timeout metadata into the tool result.
- `toolResultJSON`: parse stdout as a complete MCP tool result JSON object with `content` and `structuredContent`.

## Example

```json
{
  "nodeExecutable": "node",
  "scriptPath": "/Users/you/toolsdk/NodeJSRuntimePlugin/examples/echo_tool.js",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```
