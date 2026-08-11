# MCP Studio JavaScript scripting reference

The files in `Scripts/` run inside MCP Studio's embedded scripting environment. They use CommonJS modules, but they are not ordinary standalone Node.js programs: MCP Studio injects APIs and process-output globals used by the handlers.

## Runtime contract

The main dispatcher is `Scripts/tool_entry.js`:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
  // jsonParams is a JSON-encoded object.
  // Return a JSON string, or set a result through MCPStudio.setToolResult().
}

module.exports = { toolEntry };
```

Tool definitions connect to it with values such as:

```json
{
  "toolType": "ScriptTool",
  "scriptName": "${TOOLSDK}/Scripts/tool_entry.js",
  "execMethod": "toolEntry",
  "execHandler": "cmakeBuild"
}
```

`${TOOLSDK}` is expanded by MCP Studio. Module imports omit `./` because the scripting host resolves sibling SDK modules:

```javascript
const shared = require('sharedFunctions');
const cmake = require('cmakeBuild');
```

## Dispatcher behavior

`tool_entry.js` parses `jsonParams`, looks up `handlerName` in a fixed allowlist, and calls the matching module function. Empty parameters, invalid JSON, and unknown names return `shared.error(...)` results.

Current registered handlers:

```text
analyzeDirectory  mkdir              checkWithXcode
clangCheckSyntax  clangCompile       clangMake
shellCall         skillExecute       cmakeBuild
qmakeBuild        checkWithGcc       gccSettings
getGccInfo        fileExists         readFile
saveFile          writeFile          openFile
deleteFile        listDirectory      createDirectory
getDocumentsPath  getTempPath        fetchData
postData          fetchJSON          downloadFile
scrapeWebpage     apiRequest         checkStatus
webhookCall
```

`saveFile` and `writeFile` route to the same implementation. `previewFile.js` exists as a reusable module but is not currently registered by the JavaScript dispatcher. `bootstrap.js` provides bootstrap content and does not export a handler.

## Host APIs used by the scripts

Depending on the handler, MCP Studio supplies functions such as:

- `MCPStudio.fileExists`, `readFile`, `saveFile`, `deleteFile`
- `MCPStudio.createDirectory`, `listDirectory`
- `MCPStudio.getDocumentsPath`, `getTempPath`
- `MCPStudio.process`
- `MCPStudio.httpRequest`
- `MCPStudio.setToolResult`

Build/process helpers also read injected `stdOut` and `stdErr` arrays through `sharedFunctions.js`. External tools are launched directly with an absolute executable path and an argument array; command interpreters, pipelines, redirections, substitutions, and script strings are not supported. Scripts that use these values will fail in plain Node.js unless a test harness provides compatible globals.

`xed` is exposed as a compatibility alias and is delegated to the policy-approved `/usr/bin/xcrun xed` invocation.

## Shared result helpers

Import the shared module once:

```javascript
const shared = require('sharedFunctions');
```

### Returned JSON strings

```javascript
return shared.success({ value: 42 }, { operation: 'example' });
return shared.error('The operation failed');
```

`success()` and `createSuccessResult()` return:

```json
{
  "text": "{\n  \"value\": 42\n}",
  "success": true,
  "metadata": { "operation": "example" }
}
```

`error()` and `createErrorResult()` return:

```json
{
  "text": "The operation failed",
  "success": false,
  "metadata": { "error": "The operation failed" }
}
```

### Results set through the host

`setToolResultPayload`, `setSuccessResult`, and `setErrorResult` call `MCPStudio.setToolResult(...)` and return `null`. Success and error helpers include the top-level `success` flag as well as metadata for compatibility with the host adapter. Serialized success data is bounded to 50,000 characters and reports truncation in metadata. Use one result mechanism per code path: either return a serialized wrapper or set the host result.

## Validation and utility helpers

| Function | Behavior |
|---|---|
| `validatePath(value, name, options)` | Rejects non-strings, empty input, NUL/newlines, and `..` components; supports `absolute` or `relative` constraints |
| `validateFilePath(...)` | Named wrapper around `validatePath` |
| `validateDirectoryPath(...)` | Named wrapper around `validatePath` |
| `normalizePath(path)` | Normalizes separators and `.` segments; returns `null` for parent traversal |
| `joinPath(base, child)` | Joins two path components without resolving the filesystem |
| `validateExecutable(value, name)` | Accepts a safe executable name or validated path |
| `resolveDeveloperTool(value, name, preferredPaths)` | Resolves an approved developer tool to the absolute path required by the V1 process policy |
| `splitArgumentString(value, name)` | Converts a restricted, whitespace-separated legacy option string to an argument array |
| `executeProcess(executable, args)` | Calls `MCPStudio.process` and captures the injected output arrays |
| `limitText(value, max)` / `limitOutput(lines, max)` | Bounds content returned to the assistant |
| `setProcessResult(...)` | Produces a consistent process result from injected stdout/stderr |
| `ensureDirectory(path)` | Creates a missing directory through the host |
| `countWords(text)` | Counts non-empty whitespace-separated words |
| `getOutput()` / `getStandardOutput()` | Returns injected `stdOut` or `[]` |
| `getErrorOutput()` | Returns injected `stdErr` or `[]` |

Path validation is syntactic. It does not prove that a path exists, resolve symlinks, grant sandbox access, or authorize an operation.

## Handler parameters

The schemas in `config/Tools/` are the public configuration examples. The underlying registered handlers accept the following fields.

### Files and directories

| Handler | Parameters |
|---|---|
| `analyzeDirectory` | optional `dirPath` |
| `mkdir` | optional `dirPath` |
| `fileExists` | required `path` |
| `readFile` | required `path` |
| `saveFile`, `writeFile` | required `file_path`; optional `content` |
| `openFile` | required `path`; reads content rather than opening a GUI |
| `deleteFile` | required `path` |
| `listDirectory` | optional `path` |
| `createDirectory` | optional `dirPath` |
| `getDocumentsPath`, `getTempPath` | none |

The default for `mkdir`, `createDirectory`, and `listDirectory` is `<Documents>/.eof.mcpstudio`. `analyzeDirectory` defaults to the Documents directory itself. File reads are limited to 50,000 characters, and directory listings/analyses return at most 1,000 entries; their results report whether truncation occurred.

### Build and process tools

| Handler | Required | Optional/defaults |
|---|---|---|
| `checkWithXcode` | `projectName`, `projectDir` | `scheme`, `configuration=Debug`, `platform=macosx`, `codesign`, `codeSigningIdentity`, `clean=false`, `archive=false`, `derivedDataPath`, `onlyActiveArchs=false`, `showOperationLogs=false`, `alltargets=false` |
| `clangCheckSyntax` | `sourceFile` | — |
| `clangCompile` | `sourceFile` | — |
| `clangMake` | `makeFile` | — |
| `cmakeBuild` | `projectDir` | `projectTarget=app`, `buildType=Debug`, `cmakeFlags`, `cmakeArgs`, `verbose=false` |
| `qmakeBuild` | `projectDir` | `projectTarget`, `projectFile`, `buildType=Debug`, `qmakeArgs`, `makeArgs`, `verbose=false` |
| `shellCall` | `command` | `parameters=[]`; compatibility entry point that launches one approved developer tool directly |
| `checkWithGcc` | — | `arch`, `verbose=false` |
| `gccSettings` | — | `compiler=gcc`, `verbose=false` |
| `getGccInfo` | — | `compiler=gcc` |
| `skillExecute` | `command` | `parameters=[]`, `operation=skillExecute`; launches one approved developer tool directly |

`clangCompile` writes an object file next to the source. `cmakeBuild` uses `cmake --build` and honors `projectTarget`; `qmakeBuild` resolves qmake from standard tool locations. `cmakeFlags`, `cmakeArgs`, `qmakeArgs`, and `makeArgs` remain privileged, whitespace-separated compatibility fields; quoting and command metacharacters are rejected, and each token is passed directly as one process argument.

### HTTP tools

| Handler | Required | Optional |
|---|---|---|
| `fetchData` | `url` | `headers`, `saveToFile` |
| `postData` | `url`, `data` | `headers` |
| `fetchJSON` | `url` | `headers`, `transform`, `saveToFile` |
| `downloadFile` | `url` | `destination` |
| `apiRequest` | `url` | `method=GET`, `data`, `headers` |
| `scrapeWebpage` | `url` | `selectors`, `saveHTML` |
| `checkStatus` | `urls` | — |
| `webhookCall` | `webhookUrl` or `url` | `payload`, `method=POST`, `headers` |

`apiRequest` accepts `GET`, `POST`, `PUT`, and `PATCH`. `webhookCall` accepts `POST` and `PUT`. HTTP handlers prefer the documented `MCPStudio.httpRequest` bridge and fall back to legacy method-specific bridges when available. Text responses are bounded before being returned, sensitive response headers are redacted, and `fetchJSON.transform` accepts only declarative `filter`, `map`, and `extract` objects/arrays—caller-supplied JavaScript is never evaluated. The HTML extraction helpers are intentionally lightweight and are not a standards-compliant DOM parser.

## Script module pattern

New handlers should keep parsing, validation, work, and result creation explicit:

```javascript
const shared = require('sharedFunctions');

function exampleHandler(params) {
  const validation = shared.validateFilePath(params.path, 'path', {
    absolute: true,
  });
  if (!validation.ok) {
    return shared.error(validation.message);
  }

  try {
    const content = MCPStudio.readFile(validation.value);
    return shared.success({
      path: validation.value,
      content,
    }, {
      operation: 'exampleHandler',
    });
  } catch (error) {
    return shared.error(error.message || String(error));
  }
}

module.exports = { exampleHandler };
```

Then import the module and add its name to `HANDLERS` in `Scripts/tool_entry.js`. Add or update the corresponding JSON definition in `config/Tools/` so the public schema matches the implementation.

## Security and sandbox behavior

- Treat `shellCall`, `skillExecute`, build arguments, URLs, and output paths as privileged input.
- Validate exact paths before destructive writes or deletion.
- Do not assume path validation grants access; macOS sandbox and security-scoped resource rules still apply.
- Do not store credentials in tool JSON files or log authorization headers.
- Response text, directory entries, and process output are bounded by the shared helpers; retain those limits in new handlers to prevent context and memory exhaustion.
- Launch only approved developer tools through `MCPStudio.process` and pass every argument as a separate array item.

## Related documentation

- [Handler availability and native differences](README-Handler.md)
- [Native sample plugin](README-SamplePlugin.md)
- [MCP result boundary](README-MCPServer.md)
