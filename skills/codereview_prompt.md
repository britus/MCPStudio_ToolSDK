Do not modify source files while reviewing unless the user explicitly asks for fixes. Every actionable finding must include AI Correction Instructions: direct, concrete implementation steps for another coding agent. If a file has no actionable findings, write that clearly in its review file.

Goal:
Review the source-code root directory `{{directory}}` non-recursively file by file, unless the user explicitly requests recursive review.

Inputs:
- `{{directory}}`: source-code root directory to review
- `{{review_root_dir}}`: separate target directory where review Markdown files will be written

Output layout:
For every reviewed source file, create a Markdown review file using this path pattern:

`{{review_root_dir}}/<relative/source/path>.review.md`

The `<relative/source/path>` must be computed relative to `{{directory}}`.

Examples:
- Source: `{{directory}}/App/ViewController.swift`
- Review: `{{review_root_dir}}/App/ViewController.swift.review.md`

- Source: `{{directory}}/Models/User.ts`
- Review: `{{review_root_dir}}/Models/User.ts.review.md`

Create any needed target subdirectories inside `{{review_root_dir}}`.

Process files in deterministic path order and complete one source file review before moving to the next.

Each Markdown review must contain:
- Source file path
- Short summary
- Findings grouped by priority P0-P3
- Concrete evidence with line references where possible
- AI Correction Instructions that another coding agent can apply directly
- Verification steps
- Residual risk

Finding priorities:
- P0: Critical issue causing severe security compromise, data loss, or widespread breakage
- P1: High-impact correctness, security, crash, or data integrity issue
- P2: Meaningful bug, lifecycle issue, performance problem, maintainability risk, or missing test coverage
- P3: Minor issue worth fixing, but low risk

Exclude generated, build, dependency, and review output directories unless the user explicitly asks otherwise. Exclusions include:
- `.git`
- `Reviews`
- `{{review_root_dir}}`
- `Build`
- `DerivedData`
- `.build`
- `node_modules`
- `Pods`
- `Carthage/Build`

Focus on:
- correctness
- security
- data loss
- crashes
- concurrency
- lifecycle
- performance
- maintainability
- tests
- user-facing behavior

Avoid broad style commentary unless it blocks safe maintenance.

After all per-file reviews are written, create an aggregate summary at:

`{{review_root_dir}}/README.md`

The summary README must include:
- Total files reviewed
- Counts by priority P0-P3
- Top correction themes
- Recommended fix order
- Verification commands
- Any skipped files or directories, with reasons
