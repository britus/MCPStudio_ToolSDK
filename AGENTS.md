# Repository Guidelines

## Project Structure & Module Organization

- This repository is the macOS extension SDK for EoF MCP Studio. `include/` defines the public C ABI; `ToolJSONBridge/` provides the shared Foundation JSON bridge.
- Native products live in `SamplePlugin/`, `NodeJSRuntimePlugin/`, and `PythonRuntimePlugin/`. They are built together by `ToolSDK.xcodeproj` or independently with CMake.
- `Scripts/` contains JavaScript handlers for MCP Studio's embedded scripting host. Matching importable definitions live under `config/Tools/`; skills, prompts, and multi-agent examples are in the neighboring `config/` directories.
- `nnlab/poc3/` and `nnlab/lora/` are separate experimental Node.js and Python projects. Keep their dependencies, generated models, datasets, and build artifacts out of native SDK changes.

## Build, Test, and Development Commands

Build all native products:

    xcodebuild -project ToolSDK.xcodeproj -scheme ToolSDK -configuration Debug build

Use the shared `NodeJSRuntimeTool`, `PythonRuntimeTool`, or `SamplePluginDyLib` scheme for a targeted build. CMake builds are configured per plugin, for example:

    cmake -S NodeJSRuntimePlugin -B NodeJSRuntimePlugin/build
    cmake --build NodeJSRuntimePlugin/build

Run JavaScript tests with `cd nnlab/poc3 && npm test`; run one file with `node --test test/model.test.js`. Run the Python checks with `cd nnlab/lora && make test`; the target executes Ruff and pytest. A single Python test can be run as `.venv/bin/python -m pytest tests/test_dataset.py`.

## Coding Style & ABI Conventions

- Native targets use GNU C17 and GNU C++20. Follow the existing four-space Objective-C++/C style and avoid unrelated reformatting; no repository-wide formatter is configured.
- Preserve the exported `toolDescribe`, `toolEntry`, and ABI 4 `toolSetHostServices` contracts in `include/ToolABI.h`. Result buffers are `malloc`-allocated, host-freed UTF-8 JSON, and `resultSize` includes the trailing NUL.
- Keep handler names synchronized between `Scripts/tool_entry.js`, their implementation modules, and `config/Tools/*.json`. Embedded scripts depend on host-provided `MCPStudio.*` APIs and are not standalone Node modules.
- Python under `nnlab/lora` is checked by Ruff with Python 3.11 rules and a 100-column limit.

## Testing Guidelines

The Xcode project has no native test target; validate native changes with the aggregate or affected scheme build. Run the relevant NN-Lab suite only when that subtree changes. The `poc3` tests use temporary fixtures and do not require a generated model.

## Git Repository, Commit & Working Tree Guidelines

- Before making changes, verify that work/feature or work/bugfix is the active branch. 
- If no work/* branch exists, create and switch to the appropriate branch automatically.
- When commits are requested, commit each logical step separately using sequential identifiers (C001, C002, ...).
- Use concise, change-specific commit subjects; avoid vague or generic wording.
- Preserve unrelated user changes; never discard, stage, or commit them.
- Do not create or amend commits unless explicitly requested.
- No pull-request template is present.
