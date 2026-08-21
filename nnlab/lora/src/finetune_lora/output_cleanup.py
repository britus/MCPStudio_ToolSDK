from __future__ import annotations

import shutil
from collections.abc import Iterable
from pathlib import Path


def reset_generated_directory(
    path: str | Path,
    *,
    project_root: str | Path | None = None,
    protected_paths: Iterable[str | Path] = (),
) -> Path:
    """Recreate one narrowly scoped generated-output directory."""
    root = Path(project_root or Path.cwd()).expanduser().resolve()
    requested = Path(path).expanduser()
    if requested.is_symlink():
        raise ValueError(f"Refusing to clean a symbolic-link output directory: {requested}")
    target = requested.resolve()
    try:
        relative = target.relative_to(root)
    except ValueError as error:
        raise ValueError(
            f"Generated output directory must be inside the project root: {target}"
        ) from error
    if len(relative.parts) < 2:
        raise ValueError(
            "Refusing to clean the project root or a top-level project directory: "
            f"{target}"
        )

    for protected_path in protected_paths:
        protected = Path(protected_path).expanduser().resolve()
        if protected == target or target in protected.parents:
            raise ValueError(
                f"Refusing to clean output directory containing an input: {protected}"
            )

    if target.exists():
        if not target.is_dir():
            raise NotADirectoryError(f"Generated output path is not a directory: {target}")
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=False)
    return target
