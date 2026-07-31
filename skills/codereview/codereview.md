Review the source-code root directory `{{directory}}` non-recursively, one file at a time.

Preserve the source tree structure under `{{review_root_dir}}` and write one Markdown review file for each reviewed source file using this output path pattern:

`{{review_root_dir}}/<relative/source/path>.review.md`

Process files in deterministic path order and complete one source file review before moving to the next.

Each Markdown review must contain:
- Source file path
- Short summary
- Findings grouped by priority P0-P3
- Concrete evidence with line references where possible
- AI Correction Instructions that another coding agent can apply directly
- Verification steps
- Residual risk

Exclude generated, build, dependency, and review output directories such as .git, Reviews, Build, DerivedData, .build, node_modules, Pods, and Carthage/Build unless the user explicitly asks otherwise.

Focus on correctness, security, data loss, crashes, concurrency, lifecycle, performance, maintainability, tests, and user-facing behavior. Avoid broad style commentary unless it blocks safe maintenance.

After all per-file reviews are written, create `{{review_root_dir}}/README.md` with total files reviewed, counts by priority, top correction themes, recommended fix order, verification commands, and any skipped files with reasons.
