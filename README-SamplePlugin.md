# Sample native plugin

`SamplePlugin` demonstrates both native plugin formats supported by the Tool SDK:

- `SampleTool`: a small C dynamic library that returns a fixed MCP tool result
- `SampleTool.bundle`: an Objective-C++ macOS bundle with file, build, configuration lookup, and HTTP handlers

Both export ABI version 3 through `toolDescribe()` and `toolEntry()`.

## Prerequisites

- macOS 15 or newer
- CMake 3.25 or newer, or Xcode
- Xcode command-line tools

The CMake build creates universal `arm64;x86_64` products.

## Build with CMake

From the SDK root:

```bash
cmake -S SamplePlugin -B SamplePlugin/build
cmake --build SamplePlugin/build
```

Outputs:

```text
SamplePlugin/build/dylib/libSampleTool.dylib
SamplePlugin/build/bundle/SampleTool.bundle
```

For a clean reconfiguration, remove or choose a new build directory before running `cmake -S` again.

## Build with Xcode

```bash
xcodebuild \
  -project ToolSDK.xcodeproj \
  -scheme SamplePluginDyLib \
  -configuration Debug \
  build
```

The `ToolSDK` scheme builds both sample targets together with the runtime plugins and `ToolJSONBridge`:

```bash
xcodebuild -project ToolSDK.xcodeproj -scheme ToolSDK -configuration Debug build
```

The Xcode products are named `libSamplePluginDyLib.dylib` and `SamplePluginBundle.plugin`; the CMake products intentionally use the names shown above.

## Source layout

| Path | Purpose |
|---|---|
| `CMakeLists.txt` | Adds both CMake subprojects |
| `dylib/ToolDescriptor.c` | Dynamic-library descriptor |
| `dylib/PluginMain.c` | Minimal C `toolEntry()` implementation |
| `bundle/ToolDescriptor.c` | Bundle descriptor |
| `bundle/PluginMain.mm` | ABI entry point, JSON conversion, and buffer allocation |
| `bundle/ToolEntryHandler.mm` | Native handler dispatch and implementations |
| `ToolCapabilities.json` | Example filesystem/network permission declaration |

The bundle builds `ToolJSONBridge.mm` directly. It links Foundation, Cocoa, and AppKit.

## ABI requirements

`include/ToolABI.h` currently declares `TOOL_ABI_VERSION 3`:

```c
TOOL_API const ToolPluginDescriptor *toolDescribe(void);

TOOL_API void toolEntry(const char *sid,
                        const char *toolName,
                        const char *params,
                        char **resultJson,
                        size_t *resultSize);
```

The descriptor returned by `toolDescribe()` has static lifetime. On a successful call to `toolEntry()`, the plugin allocates `resultJson` with `malloc`; the host frees it. `resultSize` includes the NUL terminator. Set `*resultJson` and `*resultSize` to safe initial values before any operation that can fail.

## Parameter forms

The Objective-C++ bundle accepts either direct arguments:

```json
{
  "path": "/absolute/path/to/file.txt"
}
```

or a host envelope:

```json
{
  "name": "read_file",
  "execHandler": "readFile",
  "arguments": {
    "path": "/absolute/path/to/file.txt"
  }
}
```

`execHandler` selects the native handler when present; otherwise the `toolName` argument passed to `toolEntry()` is used. See [README-Handler.md](README-Handler.md) for the current handler list.

## Result form

The bundle returns a complete MCP tool-result object:

```json
{
  "structuredContent": {
    "text": "{\n  \"exists\": true\n}",
    "success": true,
    "metadata": {
      "operation": "fileExists",
      "success": true
    }
  },
  "content": [
    { "type": "text", "text": "{\n  \"exists\": true\n}" }
  ],
  "isError": false
}
```

The C dylib returns a fixed `Hello world from custom tool plugin!` result and is intended only as the smallest possible ABI example.
