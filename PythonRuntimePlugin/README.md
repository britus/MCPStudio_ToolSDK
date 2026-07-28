# Python Runtime Plugin

`PythonRuntimeTool.bundle` is an MCP Studio ToolSDK plugin that runs Python with a Python executable and returns stdout, stderr, and the process exit code as an MCP tool result.

## Build

```bash
cd ~/toolsdk/PythonRuntimePlugin
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

`pythonExecutable` is optional. If omitted or set to `python` or `python3`, the
plugin resolves an absolute executable from common Homebrew/system locations
and the MCP Studio process environment. The child `environment.PATH` does not
change which executable is launched. Other values must be existing absolute
executable paths.

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
  "pythonExecutable": "python3",
  "scriptPath": "/Users/you/toolsdk/PythonRuntimePlugin/examples/echo_tool.py",
  "stdinJSON": { "message": "hello" },
  "timeoutSeconds": 10,
  "resultMode": "capture"
}
```
