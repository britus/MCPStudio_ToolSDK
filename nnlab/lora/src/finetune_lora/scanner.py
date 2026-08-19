from __future__ import annotations

import hashlib
import re
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

SOURCE_TYPES = {
    # Extensions map directly to the Markdown code-fence language used for training.
    ".bash": "bash",
    ".c": "c",
    ".cc": "cpp",
    ".cfg": "cfg",
    ".cmake": "cmake",
    ".conf": "conf",
    ".cpp": "cpp",
    ".cs": "cs",
    ".css": "css",
    ".dart": "dart",
    ".dockerfile": "dockerfile",
    ".fs": "fs",
    ".go": "go",
    ".gradle": "gradle",
    ".graphql": "graphql",
    ".h": "c",
    ".hpp": "cpp",
    ".html": "html",
    ".ini": "ini",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".lua": "lua",
    ".m": "objective-c",
    ".md": "md",
    ".mm": "objective-c++",
    ".php": "php",
    ".proto": "proto",
    ".ps1": "ps1",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scala": "scala",
    ".scss": "scss",
    ".sh": "bash",
    ".sql": "sql",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".txt": "text",
    ".vue": "vue",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".zig": "zig",
    # Qt Designer, Qt resources, QML, qmake, Qt style sheets, and QDoc.
    ".pri": "qmake",
    ".prf": "qmake",
    ".pro": "qmake",
    ".qdoc": "qdoc",
    ".qdocconf": "qdoc",
    ".qdocinc": "qdoc",
    ".qhcp": "xml",
    ".qhp": "xml",
    ".qml": "qml",
    ".qmlproject": "qml",
    ".qmltypes": "qml",
    ".qrc": "xml",
    ".qs": "javascript",
    ".qss": "css",
    ".ui": "xml",
    # Exact filenames cover source/configuration files without a useful suffix.
    ".qmake.conf": "qmake",
    "AGENTS.md": "md",
    "CMakeLists.txt": "cmake",
    "CODEOWNERS": "text",
    "Dockerfile": "dockerfile",
    "Gemfile": "ruby",
    "Justfile": "makefile",
    "LICENSE": "text",
    "Makefile": "makefile",
    "Package.swift": "swift",
    "Podfile": "ruby",
    "README": "markdown",
    "WORKSPACE": "starlark",
    "qmldir": "qml",
}

EXCLUDED_DIRS = {
    ".cache",
    ".git",
    ".gradle",
    ".idea",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    ".vscode",
    "__pycache__",
    "artifacts",
    "build",
    "coverage",
    "DerivedData",
    "dist",
    "models",
    "node_modules",
    "Pods",
    "target",
    "vendor",
    "venv",
}

# Workflow control files describe how a dataset is built. They are never
# training documents, even though their file type is otherwise supported.
CONTROL_FILENAMES = {"dataset-policy.json"}

SENSITIVE_NAME_RE = re.compile(
    r"(^|/)(\.env($|\.)|id_(rsa|dsa|ecdsa|ed25519)$|"
    r".*(credential|secret|private[-_]?key|service[-_]?account).*)",
    re.IGNORECASE,
)
SENSITIVE_SUFFIXES = {".jks", ".key", ".keystore", ".p12", ".pfx", ".pem"}
SECRET_CONTENT_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[opusr]_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
)


@dataclass(frozen=True)
class SourceFile:
    project: str
    root: Path
    path: Path
    relative_path: str
    text: str
    sha256: str


@dataclass(frozen=True)
class SkippedFile:
    project: str
    relative_path: str
    reason: str


def _is_source(path: Path) -> bool:
    return path.name in SOURCE_TYPES or path.suffix.lower() in SOURCE_TYPES


def _git_files(root: Path) -> list[Path] | None:
    try:
        repository = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        repository_root = Path(repository.stdout.strip()).resolve()
        if repository_root != root.resolve():
            return None
        result = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    names = [name for name in result.stdout.decode("utf-8", "surrogateescape").split("\0") if name]
    return [root / name for name in names]


def _walk_files(root: Path) -> Iterator[Path]:
    for path in root.rglob("*"):
        if any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts):
            continue
        if path.is_file():
            yield path


def candidate_files(root: Path) -> list[Path]:
    paths = _git_files(root)
    if paths is None:
        paths = list(_walk_files(root))
    return sorted(
        (
            path
            for path in paths
            if path.is_file()
            and not path.is_symlink()
            and not any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts)
        ),
        key=lambda item: item.as_posix(),
    )


def scan_project(
    root: str | Path,
    max_file_bytes: int = 1_000_000,
) -> tuple[list[SourceFile], list[SkippedFile]]:
    requested_path = Path(root).expanduser()
    if requested_path.is_symlink():
        raise ValueError(f"Input path must not be a symbolic link: {requested_path}")
    input_path = requested_path.resolve()
    explicit_file = input_path.is_file()
    if input_path.is_dir():
        project_root = input_path
        paths = candidate_files(project_root)
    elif explicit_file:
        project_root = input_path.parent
        paths = [input_path]
    else:
        raise ValueError(f"Input path is not a file or directory: {input_path}")
    project = project_root.name
    sources: list[SourceFile] = []
    skipped: list[SkippedFile] = []

    for path in paths:
        relative = path.relative_to(project_root).as_posix()
        if path.name in CONTROL_FILENAMES:
            skipped.append(SkippedFile(project, relative, "workflow control file"))
            continue
        if SENSITIVE_NAME_RE.search(relative) or path.suffix.lower() in SENSITIVE_SUFFIXES:
            skipped.append(SkippedFile(project, relative, "sensitive filename"))
            continue
        if not _is_source(path):
            if explicit_file:
                skipped.append(SkippedFile(project, relative, "unsupported file type"))
            continue
        try:
            size = path.stat().st_size
        except OSError:
            skipped.append(SkippedFile(project, relative, "cannot stat"))
            continue
        if size == 0:
            skipped.append(SkippedFile(project, relative, "empty"))
            continue
        if size > max_file_bytes:
            skipped.append(SkippedFile(project, relative, "too large"))
            continue
        try:
            raw = path.read_bytes()
        except OSError:
            skipped.append(SkippedFile(project, relative, "cannot read"))
            continue
        if b"\0" in raw:
            skipped.append(SkippedFile(project, relative, "binary"))
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            skipped.append(SkippedFile(project, relative, "not UTF-8"))
            continue
        if any(pattern.search(text) for pattern in SECRET_CONTENT_PATTERNS):
            skipped.append(SkippedFile(project, relative, "possible embedded secret"))
            continue
        sources.append(
            SourceFile(
                project=project,
                root=project_root,
                path=path,
                relative_path=relative,
                text=text,
                sha256=hashlib.sha256(raw).hexdigest(),
            )
        )
    return sources, skipped


def language_for(path: str) -> str:
    source = Path(path)
    return SOURCE_TYPES.get(
        source.name,
        SOURCE_TYPES.get(source.suffix.lower(), source.suffix.lower().lstrip(".") or "text"),
    )
