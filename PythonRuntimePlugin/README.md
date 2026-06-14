# Python Runtime Plugin

`PythonRuntimeTool.bundle` is an MCP Studio ToolSDK plugin that runs Python with a Python executable and returns stdout, stderr, and the process exit code as an MCP tool result.

## Build

```bash
cd /Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/PythonRuntimePlugin
mkdir -p build
cd build
cmake ..
make
```

The bundle is produced at:

```text
build/bundle/PythonRuntimeTool.bundle
```

## Tool Arguments

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

`pythonExecutable` is optional. If omitted, the plugin checks common Homebrew and system locations and falls back to `/usr/bin/env python3`.

`scriptPath` is required unless `inlineScript` is provided.

`resultMode` supports:

- `capture`: package stdout, stderr, exitCode, and timeout metadata into the tool result.
- `toolResultJSON`: parse stdout as a complete MCP tool result JSON object with `content` and `structuredContent`.

## Example

```json
{
  "pythonExecutable": "python3",
  "scriptPath": "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/PythonRuntimePlugin/examples/echo_tool.py",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```
