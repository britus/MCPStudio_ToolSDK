from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .chat import _messages, _mlx_answer, _mlx_backend
from .config import load_config, nested, resolve_path
from .retrieval import format_context, search


def _prompt_text(item: dict[str, Any]) -> str:
    text = item.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    prompt = item.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt.strip()
    if isinstance(prompt, list):
        for message in reversed(prompt):
            if (
                isinstance(message, dict)
                and message.get("role") == "user"
                and isinstance(message.get("content"), str)
                and message["content"].strip()
            ):
                return message["content"].strip()
    raise ValueError("Each verification record requires text or a user prompt message")


def _load_prompts(path: str | Path) -> list[dict[str, Any]]:
    prompt_path = resolve_path(path)
    if not prompt_path.is_file():
        raise FileNotFoundError(f"Verification prompt suite not found: {prompt_path}")
    with prompt_path.open(encoding="utf-8") as handle:
        prompts = [json.loads(line) for line in handle if line.strip()]
    if not prompts:
        raise ValueError(f"Verification prompt suite is empty: {prompt_path}")
    return prompts


def verify(
    config_path: str,
    adapter: str,
    prompts_path: str,
    output: Path,
    no_rag: bool = False,
) -> dict[str, Any]:
    config = load_config(config_path)
    backend = _mlx_backend(config, adapter)
    index_path = resolve_path(nested(config, "data", "index_file"))
    answers: list[dict[str, Any]] = []

    for index, item in enumerate(_load_prompts(prompts_path), start=1):
        prompt = _prompt_text(item)
        context = ""
        results = []
        if not no_rag and index_path.exists():
            results = search(
                index_path,
                item.get("retrieval_query", prompt),
                top_k=int(item.get("top_k", nested(config, "retrieval", "top_k", 6))),
            )
            context = format_context(
                results,
                max_chars=int(nested(config, "retrieval", "max_context_chars", 18_000)),
            )
        messages = _messages(prompt, context)
        answer = _mlx_answer(config, messages, backend)
        answers.append(
            {
                "id": item.get("id", f"check-{index}"),
                "prompt": prompt,
                "retrieval_query": item.get("retrieval_query", prompt),
                "sources": [
                    {
                        "path": result.path,
                        "start_line": result.start_line,
                        "end_line": result.end_line,
                    }
                    for result in results
                ],
                "answer": answer,
            }
        )

    report = {
        "config": config_path,
        "adapter": adapter,
        "rag": not no_rag,
        "answers": answers,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate adapter answers for a configured held-out prompt suite"
    )
    parser.add_argument("--config", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--prompts", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--no-rag", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    report = verify(
        args.config,
        args.adapter,
        args.prompts,
        resolve_path(args.output),
        args.no_rag,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nVerification report written to {args.output}")


if __name__ == "__main__":
    main()
