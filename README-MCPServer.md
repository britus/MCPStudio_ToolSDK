# MCP integration boundary

The Tool SDK does not contain the EoF MCP Studio HTTP server, transport, router, or application service implementations. Those components belong to the host application. This repository provides tool plugins, scripting handlers, and configuration that the host exposes through Model Context Protocol (MCP).

## What is in this repository

- The native custom-tool ABI in `include/ToolABI.h`
- JavaScript handler dispatch in `Scripts/tool_entry.js`
- Native sample and language-runtime plugins
- Importable tool definitions in `config/Tools/`
- A linked MCP reference resource in `config/Resources/message context protocol (mcp) specification.json`

The configured reference targets MCP specification version `2025-06-18` and links to the Tools, Resources, and Prompts server documentation.

## Host-to-plugin call

For a native custom tool, MCP Studio:

1. Loads the plugin and validates the descriptor returned by `toolDescribe()`.
2. Calls the exported `toolEntry()` function with the session ID, tool/handler name, and UTF-8 JSON parameters.
3. Reads `resultJson` using `resultSize` and then releases the plugin-allocated buffer with `free()`.
4. Converts the returned object into the response for the protocol tool call.

The parameter object can be passed directly or as a host envelope whose `arguments` member contains the tool arguments. The sample and runtime bundles normalize both forms.

## Tool-result contract

Native plugins return a complete MCP-compatible tool-result object:

```json
{
  "structuredContent": {
    "success": true,
    "value": 42
  },
  "content": [
    { "type": "text", "text": "Completed" }
  ],
  "isError": false
}
```

On failure, set `isError` to `true`, provide a useful text content item, and put machine-readable diagnostics in `structuredContent` or its metadata. The Node.js and Python runtime plugins generate this envelope automatically in `capture` mode. In `toolResultJSON` mode, the child process must print one complete JSON object containing both `content` (array) and `structuredContent` (object).

JavaScript handlers use the older scripting-host wrapper from `Scripts/sharedFunctions.js`:

```json
{
  "text": "{\"value\":42}",
  "success": true,
  "metadata": {}
}
```

MCP Studio adapts that wrapper to the protocol-facing result.

## Tool definitions

The examples in `config/Tools/` show the three implementation types understood by the host:

| `toolType` | Implementation location | Examples |
|---|---|---|
| `ScriptTool` | `Scripts/tool_entry.js` and its modules | `cmake_build`, `shell_call` |
| `CustomTool` | Native bundle loaded by `pluginName` | `nodejs_runtime`, `python_runtime` |
| `BuiltinTool` | MCP Studio application | Calendar, Contacts, file resources |

A tool definition connects the public tool `name` and JSON schemas to `execHandler`, `execMethod`, and—where applicable—`scriptName` or `pluginName`.

## Protocol reference resource

`config/Resources/message context protocol (mcp) specification.json` is a `resourceLink`, not a local copy of the specification. Network access is required when MCP Studio follows its URI or related-resource links.

For current protocol behavior, use the version declared by the imported resource or the version negotiated by the running MCP Studio host. Do not infer server transport behavior from this SDK alone.
