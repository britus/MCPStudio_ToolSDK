# NodeJS Runtime Plugin

`NodeJSRuntimeTool.bundle` is an MCP Studio ToolSDK plugin that runs JavaScript with a Node.js executable and returns stdout, stderr, and the process exit code as an MCP tool result.

## Build

```bash
cd /Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/NodeJSRuntimePlugin
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

`nodeExecutable` is optional. If omitted, the plugin checks common Homebrew locations and falls back to `/usr/bin/env node`.

`scriptPath` is required unless `inlineScript` is provided.

`resultMode` supports:

- `capture`: package stdout, stderr, exitCode, and timeout metadata into the tool result.
- `toolResultJSON`: parse stdout as a complete MCP tool result JSON object with `content` and `structuredContent`.

## Example

```json
{
  "nodeExecutable": "node",
  "scriptPath": "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/NodeJSRuntimePlugin/examples/echo_tool.js",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```
