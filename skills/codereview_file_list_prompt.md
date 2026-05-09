Review each source file listed in {{source_file_list}}.

Use {{source_file_list}} as the complete and authoritative input set.
Do not list files from {{directory}}.
Do not recursively traverse directories.
Do not add sibling files, dependency files, generated files, test files, or related files unless they are explicitly present in {{source_file_list}}.
If a listed path does not exist, create a review file documenting that the file could not be read.

Write one Markdown review per source file at:
{{review_root_dir}}/<relative/source/path>.review.md

Preserve the relative source path exactly as given in {{source_file_list}}.

Create a README at:
{{review_root_dir}}/README.md

after all file reviews summarizing results.

Traversal & ordering

Process only files explicitly listed in {{source_file_list}}.
Process files in deterministic lexicographic path order based on the listed path strings.
Fully complete the review for one file before starting the next.
Do not skip a listed file because it is in an excluded or generated-looking directory; the explicit list overrides directory exclusions.
Do not include any file that is not explicitly listed in {{source_file_list}}.

Per-file review output (Markdown)

Filename:
{{review_root_dir}}/<relative/source/path>.review.md

Required sections and exact headings, in this order:

Source file path
Short summary
Findings
Priority P0
Priority P1
Priority P2
Priority P3
Evidence
AI Correction Instructions
Verification steps
Residual risk

Section requirements:

Source file path
Include the exact source file path from {{source_file_list}}.

Short summary
Use 1–3 sentences describing the file purpose.

Findings
Group actionable findings by priority using the exact labels:
Priority P0
Priority P1
Priority P2
Priority P3

Under each priority include 0 or more bullet items.
Each finding must be a single-sentence statement about the issue.
If there are no actionable findings for a priority, write:
- No findings.

Evidence
Use bullets that cite concrete code excerpts or exact line ranges using this format:
- lines X–Y: `minimal code snippet`

Evidence must demonstrate the finding with the minimal snippet needed.

AI Correction Instructions
For each finding, provide actionable, step-by-step instructions another coding agent can apply directly.
Use numbered steps.
Reference specific lines, functions, classes, methods, variables, or symbols.

Verification steps
Use numbered commands or checks to confirm the fix.
Include unit tests to run, expected outputs, or example inputs where applicable.

Residual risk
Use short bullets describing what could still fail after fixes and why.

Content rules for reviews

Focus scope: correctness, security, data loss, crashes, concurrency, lifecycle, performance, maintainability, tests, and user-facing behavior.
Avoid general style comments unless they impede safe maintenance.
Be specific: always reference line numbers or exact symbols.
Make fixes deterministic and minimal: prefer small, local changes unless an architectural fix is required; if so, explain clearly and provide migration steps.
Use conservative language for uncertain claims, such as “likely”, “may”, or “needs confirmation by running test X”.
Do not include external URLs in per-file reviews.

README summary

Filename:
{{review_root_dir}}/README.md

Required contents and headings:

Total files reviewed: N
Counts by priority: P0: n, P1: n, P2: n, P3: n
Top 3 correction themes
Recommended fix order
Verification commands

README section requirements:

Total files reviewed: N
Count only files explicitly listed in {{source_file_list}} that were processed, including unreadable, binary, empty, or parse-failed files.

Counts by priority: P0: n, P1: n, P2: n, P3: n
Count actionable findings across all per-file reviews.

Top 3 correction themes
Use short bullets, for example:
- input validation failures
- concurrency race in X
- missing null checks

Recommended fix order
List priority plus short rationale.

Verification commands
Provide a consolidated list of one-line commands/tests to run across the repo.
Include specific test names if available.

Determinism & reproducibility

All outputs must be deterministic given the same {{source_file_list}} and same file contents:
same file ordering, same wording templates, same headings, and same section order.
When referencing code lines, use the line numbers from the file as read during review.
Do not modify {{source_file_list}}.
Do not normalize, expand, or deduplicate paths unless exact duplicates appear; exact duplicates should be reviewed once and noted in the README.

Edge cases

Missing files:
Create a .review.md file for the listed path and state that the file could not be read.
Include no actionable findings unless the missing file itself is a review-relevant issue.

Binary or non-text files:
Create a .review.md file and note reason “non-text/binary”.
Do not attempt source review.

Empty files:
Create a review noting “empty file” and no findings.

Large files (>5000 LOC):
Produce a short summary, list the top 5 highest-priority findings, and note that a deeper review is recommended.
Still create the .review.md file.

Parsing or encoding failures:
Create a review file documenting the parsing or encoding error.
Skip source analysis for that file.

Tone & format

Use concise, technical, and actionable language.
Use the exact headings and section order specified.
Produce only the required files and content.
Do not produce extra commentary.

{{source_file_list}}
