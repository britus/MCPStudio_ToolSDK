# MCP Studio Tool SDK

The MCP Studio Tool SDK is the extension-development repository for EoF MCP Studio on macOS. It contains the native custom-tool ABI, example C/Objective-C++ plugins, Node.js and Python runtime plugins, JavaScript tool handlers, importable MCP Studio configuration, and an experimental Node.js neural-network lab.

## Requirements

- macOS 15 or newer
- Xcode and the Xcode command-line tools
- CMake 3.25 or newer for CMake builds
- Node.js 18 or newer for `nnlab/poc3`
- Node.js and/or Python 3 when using the corresponding runtime plugin

## Repository layout

| Path | Purpose |
|---|---|
| `include/` | Public C ABI and logging declarations for native plugins |
| `ToolJSONBridge/` | Foundation-based JSON bridge shared by Objective-C++ plugins |
| `SamplePlugin/` | Example dynamic-library and macOS bundle implementations |
| `NodeJSRuntimePlugin/` | Custom-tool bundle that launches Node.js scripts |
| `PythonRuntimePlugin/` | Custom-tool bundle that launches Python scripts |
| `Scripts/` | JavaScript handlers executed by MCP Studio's scripting host |
| `config/` | Importable tools, skills, prompts, resources, multi-agent workflows, and provider examples |
| `skills/codereview/` | Markdown prompt assets used by the code-review skill configuration |
| `nnlab/poc3/` | Dependency-free generative character-model experiment |
| `ToolSDK.xcodeproj` | Xcode project for all native SDK targets |

## Build the native targets

### Xcode

The shared `ToolSDK` scheme builds all native products:

```bash
xcodebuild \
  -project ToolSDK.xcodeproj \
  -scheme ToolSDK \
  -configuration Debug \
  build
```

Individual shared schemes are available for `NodeJSRuntimeTool`, `PythonRuntimeTool`, and `SamplePluginDyLib`. The project contains these targets:

- `NodeJSRuntimeTool`
- `PythonRuntimeTool`
- `SamplePluginBundle`
- `SamplePluginDyLib`
- `ToolJSONBridge`

### CMake

Each plugin can also be configured independently:

```bash
cmake -S SamplePlugin -B SamplePlugin/build
cmake --build SamplePlugin/build

cmake -S NodeJSRuntimePlugin -B NodeJSRuntimePlugin/build
cmake --build NodeJSRuntimePlugin/build

cmake -S PythonRuntimePlugin -B PythonRuntimePlugin/build
cmake --build PythonRuntimePlugin/build
```

The projects default to universal `arm64;x86_64` builds with a macOS 15.0 deployment target. See the plugin-specific guides for output paths and runtime packaging:

- [Sample plugin](README-SamplePlugin.md)
- [Node.js runtime](NodeJSRuntimePlugin/README.md)
- [Python runtime](PythonRuntimePlugin/README.md)

## Native plugin ABI

[`include/ToolABI.h`](include/ToolABI.h) defines ABI version 3. Every native custom-tool plugin exports:

```c
const ToolPluginDescriptor *toolDescribe(void);

void toolEntry(const char *sid,
               const char *toolName,
               const char *params,
               char **resultJson,
               size_t *resultSize);
```

`toolDescribe()` returns static metadata, including the ABI version, tool identifier, entry-point name, and capability JSON. `toolEntry()` returns a UTF-8 JSON buffer allocated with `malloc`; the host owns that buffer and releases it with `free`. `resultSize` includes the trailing NUL byte.

A successful native result normally uses the MCP tool-result shape:

```json
{
  "structuredContent": { "success": true },
  "content": [{ "type": "text", "text": "Completed" }],
  "isError": false
}
```

## JavaScript tools

[Scripts/tool_entry.js](Scripts/tool_entry.js) dispatches the script handlers used by the JSON 
definitions in `config/Tools/`. The registered handler groups are:

- file and directory access
- Clang, GCC, CMake, QMake, Xcode, and shell operations
- HTTP requests, downloads, status checks, webhooks, and HTML extraction
- document/temp path discovery
- skill-script execution

Script tools run inside EoF MCP Studio's scripting environment and use host-provided APIs such as 
`MCPStudio.fileExists`, `MCPStudio.process`, and `MCPStudio.httpRequest`; they are not standalone
Node.js modules. 
See the [scripting reference](README-Scripting.md) and [handler catalog](README-Handler.md).

## Configuration examples

`config/` is example/import content for EoF MCP Studio:

- `config/Tools/`: script, built-in, and native custom-tool definitions
- `config/Skills/`: reusable task workflows
- `config/Prompts/`: prompt definitions
- `config/Resources/`: linked reference resources
- `config/MultiAgents/`: example agent workflows
- `config/aiproviders.json` and `config/sysprompts.json`: provider and system prompts

`${TOOLSDK}` in a configuration path is resolved by EoF MCP Studio to the installed SDK root. 
Built-in tool definitions such as Calendar, Contacts, and `FileResourceHandler` describe host-app 
capabilities; their implementations are not part of this repository.

## MCP integration

This repository supplies tools and configuration consumed by EoF MCP Studio. 
It does not contain the application's MCP HTTP server implementation. 
[README-MCPServer.md](README-MCPServer.md) documents that boundary and 
the protocol-facing result contract used by SDK plugins.

## Neural-network lab

`nnlab/poc3` trains and serves a small character-level generative model in plain
Node.js. It includes Safetensors persistence, incremental training, deterministic 
dataset replay, CLI inference, a browser UI, and tests. Generated `model.safetensors` 
and the default `dataset.txt` are not currently checked in; follow the 
[PoC quick start](nnlab/poc3/README.md) to create them.

## Releases

- [EoF MCP Studio on the Mac App Store](https://apps.apple.com/us/app/eof-mcp-studio/id6758146445?mt=12)
- [EoF MCP Studio direct download](https://mcpstudio.eofsl.com/download.html)

## Documentation

- [JavaScript scripting reference](README-Scripting.md)
- [Handler catalog](README-Handler.md)
- [Native sample plugin](README-SamplePlugin.md)
- [MCP integration boundary](README-MCPServer.md)
- [Node.js runtime plugin](NodeJSRuntimePlugin/README.md)
- [Python runtime plugin](PythonRuntimePlugin/README.md)
- [Neural-network PoC](nnlab/poc3/README.md)

## License

Copyright (C) 2026 EoF Software Lab. All rights reserved. See [LICENSE](LICENSE).
