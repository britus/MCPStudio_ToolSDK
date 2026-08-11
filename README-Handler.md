# Tool handler catalog

This guide describes the handler names implemented in the repository. There are two dispatchers:

- `Scripts/tool_entry.js` dispatches JavaScript handlers inside the MCP Studio scripting host.
- `SamplePlugin/bundle/ToolEntryHandler.mm` dispatches native Objective-C++ handlers in the sample bundle.

The native dispatcher contains most script equivalents plus a few bundle-only handlers. Tool definitions in `config/Tools/` are the authoritative public names and input schemas shipped with this checkout.

## Calling conventions

### JavaScript dispatcher

```javascript
const result = toolEntry(sessionId, handlerName, JSON.stringify(arguments));
```

`jsonParams` must be a JSON object encoded as a string. Unknown handlers and invalid JSON return an error wrapper from `Scripts/sharedFunctions.js`.

### Native dispatcher

```c
toolEntry(sessionId, toolName, paramsJSON, &resultJSON, &resultSize);
```

The sample bundle accepts direct arguments or a host envelope:

```json
{
  "execHandler": "fileExists",
  "arguments": { "path": "/absolute/path" }
}
```

When an envelope is used, the bundle unwraps `arguments`. `testHandler` has highest routing priority, followed by `execHandler`, followed by the `toolName` function argument. `testHandler` is intended for local testing and should not be used in production definitions.

## Availability matrix

| Handler | JavaScript | Sample bundle | Main parameters |
|---|:---:|:---:|---|
| `analyzeDirectory` | yes | yes | `dirPath` |
| `mkdir` | yes | yes | `dirPath` |
| `fileExists` | yes | yes | `path` |
| `readFile` | yes | yes | `path` |
| `saveFile` / `writeFile` | yes | yes | `file_path`, `content` |
| `openFile` | yes | yes | `path` |
| `deleteFile` | yes | yes | `path` |
| `listDirectory` | yes | yes | `path` |
| `createDirectory` | yes | yes | `dirPath` |
| `getDocumentsPath` | yes | yes | none |
| `getTempPath` | yes | yes | none |
| `previewFile` | no | yes | `filePath` |
| `fetchPrompt` | no | yes | `promptName` or `name` |
| `fetchResource` | no | yes | `resourceName` or `name` |
| `checkWithXcode` | yes | yes | `projectDir`, `projectName`, build options |
| `clangCheckSyntax` | yes | yes | `sourceFile` |
| `clangCompile` | yes | yes | `sourceFile` |
| `clangMake` | yes | yes | `makeFile` |
| `cmakeBuild` | yes | yes | `projectDir`, build options |
| `qmakeBuild` | yes | yes | `projectDir`, QMake options |
| `shellCall` | yes | yes | `command`, `parameters` |
| `checkWithGcc` | yes | yes | `arch`, `verbose` |
| `gccSettings` | yes | yes | `compiler`, `verbose` |
| `getGccInfo` | yes | yes | `compiler` |
| `skillExecute` | yes | no | `command`, `parameters`, `operation` |
| `fetchData` | yes | yes | `url`, `headers`, `saveToFile` |
| `postData` | yes | yes | `url`, `data`, `headers` |
| `fetchJSON` | yes | yes | `url`, `headers`, transform/save options |
| `downloadFile` | yes | yes | `url`, `destination` |
| `apiRequest` | yes | yes | `url`, `method`, `data`, `headers` |
| `scrapeWebpage` | yes | yes | `url`, extraction/save options |
| `checkStatus` | yes | yes | `urls` |
| `webhookCall` | yes | yes | `webhookUrl` or `url`, `payload`, `method` |

## File and path handlers

### `analyzeDirectory`

Uses `dirPath`, defaulting to the MCP Studio Documents path. The JavaScript implementation returns the directory entries, item count, truncation status, and analyzed path. It caps returned entries at 1,000. The native implementation returns entry names and item count.

### `mkdir` and `createDirectory`

Create the directory in `dirPath`. If omitted, both implementations default to `<Documents>/.eof.mcpstudio`. Existing directories are treated as successful results by the JavaScript helpers.

### `fileExists`

Requires `path` and reports whether it exists. The path validator rejects empty strings, control characters, and `..` traversal components.

### `readFile` and `openFile`

Require `path`. Both read text content through the same host API; `openFile` is an alias-like handler rather than a GUI open operation. Script results cap returned content at 50,000 characters and report the original length and truncation status. The public built-in `read_file` configuration uses `file_path` and `FileResourceHandler`, so do not confuse that host tool with the script/native `readFile` handler.

### `saveFile` and `writeFile`

Require `file_path`; `content` defaults to an empty string. They create or replace the target file through the host API or Foundation implementation.

### `deleteFile`

Requires `path` and deletes that target. Callers should resolve and validate the exact target before invocation because deletion is not recoverable through this handler.

### `listDirectory`

Uses `path`, defaulting to `<Documents>/.eof.mcpstudio`, and returns the immediate entries. It is not recursive. The JavaScript result contains at most 1,000 entries and reports the total count and truncation status.

### `getDocumentsPath` and `getTempPath`

Take no meaningful arguments and return the path supplied by the scripting host or native platform APIs.

### Bundle-only file/config handlers

- `previewFile` reads `filePath` and returns a text preview with metadata.
- `fetchPrompt` looks up JSON by `promptName` or `name` under `config/Prompts`.
- `fetchResource` looks up JSON by `resourceName` or `name` under `config/Resources`.

Lookup accepts an exact JSON filename or a normalized name. These handlers locate the SDK root relative to the bundle/environment, so moved installations must preserve or configure that relationship.

## Build and process handlers

### `checkWithXcode`

Required parameters:

- `projectDir`: absolute project directory
- `projectName`: project name without `.xcodeproj`

Optional parameters include `scheme`, `configuration` (default `Debug`), `platform` (default `macosx`), `codesign` (the development-team identifier), `codeSigningIdentity`, `clean`, `archive`, `derivedDataPath`, `onlyActiveArchs`, `showOperationLogs`, and script-only `alltargets`. The JavaScript implementation uses `xcodebuild clean` rather than deleting build directories directly and suppresses routine output unless operation logs are requested.

### Clang handlers

- `clangCheckSyntax`: runs Clang syntax checking for `sourceFile`.
- `clangCompile`: compiles `sourceFile` to a neighboring `.o` object file.
- `clangMake`: runs Make using the absolute `makeFile` path.

### `cmakeBuild`

Requires `projectDir`. Optional fields are `projectTarget` (default `app`), `buildType` (default `Debug`), `cmakeFlags`, `cmakeArgs`, and `verbose`. The JavaScript implementation converts the two restricted, whitespace-separated compatibility fields to process arguments and builds the requested target through `cmake --build`.

### `qmakeBuild`

Requires `projectDir`. Optional fields are `projectTarget`, `projectFile`, `buildType`, `qmakeArgs`, `makeArgs`, and `verbose`. `projectFile` must be relative and defaults to `<projectTarget>.pro`. QMake is resolved from standard executable locations and is invoked directly with an argument array.

### `shellCall`

Requires `command`, which must name a Launch Agent V1 approved developer tool or provide its absolute executable path. `parameters` is a verbatim string array. The handler does not start a command interpreter, so pipelines, redirections, substitutions, and script strings are unavailable. This remains a privileged execution surface and should be exposed only in trusted configurations.

### GCC inspection

- `checkWithGcc`: discovers compiler/toolchain capabilities; accepts `arch` and `verbose`.
- `gccSettings`: inspects `gcc` or `g++`; accepts `compiler` and `verbose`.
- `getGccInfo`: reports details for `compiler`, defaulting to `gcc`.

### `skillExecute`

JavaScript-only compatibility handler that launches one approved developer tool from `command` with the verbatim `parameters` string array. `operation` defaults to `skillExecute`. It does not accept script content and should be enabled only for trusted skill definitions.

## HTTP handlers

The JavaScript implementations prefer `MCPStudio.httpRequest` and retain compatible fallbacks for older method-specific host bridges; binary downloads use `MCPStudio.downloadFile`. The native sample bundle uses Foundation networking. Network access must also be permitted by the host and plugin capability policy.

| Handler | Behavior |
|---|---|
| `fetchData` | GET text from `url`; optional `headers` and `saveToFile` path |
| `postData` | POST `data` to `url`; optional `headers` |
| `fetchJSON` | GET and parse JSON; optional transform and save path |
| `downloadFile` | Download `url` to `destination` or a temp path |
| `apiRequest` | Request with `GET`, `POST`, `PUT`, or `PATCH` and optional body/headers |
| `scrapeWebpage` | Fetch HTML and extract basic page information |
| `checkStatus` | Check each URL in `urls` |
| `webhookCall` | Send `payload` to `webhookUrl`/`url` with `POST` or `PUT` |

Do not put credentials directly in checked-in tool definitions. Supply authorization headers at runtime and avoid returning secret-bearing response content to untrusted callers.

## Results and errors

JavaScript handlers return the scripting wrapper:

```json
{
  "text": "{\n  \"exists\": true\n}",
  "success": true,
  "metadata": {}
}
```

The native sample bundle returns a full MCP tool-result object with `structuredContent`, `content`, and `isError`. Both dispatchers catch or convert ordinary handler failures into error results, but ABI-level failures such as invalid output pointers cannot return a buffer safely.

## Public tool names versus handler names

Tool names are snake case (`cmake_build`, `file_exists`), while script/native handler names are camel case (`cmakeBuild`, `fileExists`). The mapping is declared by `execHandler` in each `config/Tools/*.json` file. Built-in definitions point to application handlers not implemented in this repository.
