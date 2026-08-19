from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .config import load_config, nested, resolve_path
from .prepare import chunk_source
from .scanner import scan_project


@dataclass(frozen=True)
class SearchResult:
    project: str
    path: str
    start_line: int
    end_line: int
    content: str
    score: float


SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    project TEXT NOT NULL,
    path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    content TEXT NOT NULL,
    source_sha256 TEXT NOT NULL
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(
    project,
    path,
    content,
    content='chunks',
    content_rowid='id',
    tokenize='unicode61 tokenchars ''_'''
);
INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
"""


def build_index(
    projects: Sequence[str | Path],
    index_path: Path,
    *,
    chunk_lines: int,
    overlap_lines: int,
    max_file_bytes: int,
) -> int:
    if not projects:
        raise ValueError("At least one --project path is required")
    index_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = index_path.with_suffix(index_path.suffix + ".tmp")
    if temporary.exists():
        temporary.unlink()
    connection = sqlite3.connect(temporary)
    count = 0
    try:
        connection.execute(
            """
            CREATE TABLE chunks (
                id INTEGER PRIMARY KEY,
                project TEXT NOT NULL,
                path TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                content TEXT NOT NULL,
                source_sha256 TEXT NOT NULL
            )
            """
        )
        for project_path in projects:
            sources, _ = scan_project(project_path, max_file_bytes=max_file_bytes)
            for source in sources:
                for chunk in chunk_source(source, chunk_lines, overlap_lines):
                    connection.execute(
                        """
                        INSERT INTO chunks
                        (project, path, start_line, end_line, content, source_sha256)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            chunk.project,
                            chunk.path,
                            chunk.start_line,
                            chunk.end_line,
                            chunk.content,
                            chunk.source_sha256,
                        ),
                    )
                    count += 1
        connection.execute(
            """
            CREATE VIRTUAL TABLE chunks_fts USING fts5(
                project,
                path,
                content,
                content='chunks',
                content_rowid='id',
                tokenize='unicode61 tokenchars ''_'''
            )
            """
        )
        connection.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')")
        connection.commit()
    finally:
        connection.close()
    os.replace(temporary, index_path)
    return count


def _fts_query(query: str) -> str:
    tokens = re.findall(r"[\w]{2,}", query, flags=re.UNICODE)
    unique = list(dict.fromkeys(token.lower() for token in tokens))[:24]
    return " OR ".join(f'"{token.replace(chr(34), chr(34) * 2)}"' for token in unique)


def search(index_path: str | Path, query: str, top_k: int = 6) -> list[SearchResult]:
    expression = _fts_query(query)
    if not expression:
        return []
    connection = sqlite3.connect(Path(index_path))
    try:
        rows = connection.execute(
            """
            SELECT c.project, c.path, c.start_line, c.end_line, c.content,
                   bm25(chunks_fts, 1.5, 3.0, 1.0) AS rank
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.rowid
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (expression, top_k),
        ).fetchall()
    finally:
        connection.close()
    return [
        SearchResult(
            project=row[0],
            path=row[1],
            start_line=row[2],
            end_line=row[3],
            content=row[4],
            score=-float(row[5]),
        )
        for row in rows
    ]


def format_context(results: Sequence[SearchResult], max_chars: int = 18_000) -> str:
    blocks: list[str] = []
    length = 0
    for item in results:
        block = (
            f"### {item.project}/{item.path}:{item.start_line}-{item.end_line}\n"
            f"{item.content}\n"
        )
        remaining = max_chars - length
        if remaining <= 0:
            break
        blocks.append(block[:remaining])
        length += len(block)
    return "\n".join(blocks)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build or query the local source index")
    parser.add_argument("--config", required=True)
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build")
    build.add_argument("--project", action="append", required=True)
    build.add_argument("--index")
    query = subparsers.add_parser("query")
    query.add_argument("text")
    query.add_argument("--index")
    query.add_argument("--top-k", type=int)
    query.add_argument("--json", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    index_path = resolve_path(args.index or nested(config, "data", "index_file"))
    if args.command == "build":
        count = build_index(
            args.project,
            index_path,
            chunk_lines=int(nested(config, "data", "chunk_lines", 140)),
            overlap_lines=int(nested(config, "data", "overlap_lines", 20)),
            max_file_bytes=int(nested(config, "data", "max_file_bytes", 1_000_000)),
        )
        print(f"Indexed {count} source chunks in {index_path}")
        return
    results = search(
        index_path,
        args.text,
        top_k=args.top_k or int(nested(config, "retrieval", "top_k", 6)),
    )
    if args.json:
        print(json.dumps([result.__dict__ for result in results], indent=2, ensure_ascii=False))
    else:
        print(
            format_context(
                results,
                max_chars=int(nested(config, "retrieval", "max_context_chars", 18_000)),
            )
        )


if __name__ == "__main__":
    main()
