from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .config import load_config, model_source, nested, resolve_path
from .dataset import fold_system_messages
from .modeling import load_model, load_tokenizer
from .retrieval import format_context, search

SYSTEM_PROMPT = """You are a precise coding assistant. Use the retrieved repository context below.
Prefer current retrieved code over memorized training snapshots. Cite file paths and line ranges
when they support the answer. If the context does not contain enough evidence, say so instead of
inventing project-specific APIs.

Retrieved repository context:
{context}
"""


def _messages(question: str, context: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT.format(context=context or "(none)")},
        {"role": "user", "content": question},
    ]


def _lmstudio_answer(config: dict[str, Any], messages: list[dict[str, str]]) -> str:
    base_url = os.getenv(
        "LM_STUDIO_BASE_URL",
        str(nested(config, "inference", "base_url")),
    ).rstrip("/")
    parsed_url = urllib.parse.urlparse(base_url)
    if parsed_url.scheme not in {"http", "https"} or parsed_url.hostname not in {
        "127.0.0.1",
        "::1",
        "localhost",
    }:
        raise ValueError(
            "Offline mode only permits a loopback LM Studio URL "
            "(localhost, 127.0.0.1, or ::1)."
        )
    api_key = os.getenv(
        "LM_STUDIO_API_KEY",
        str(nested(config, "inference", "api_key", "lm-studio")),
    )
    payload = {
        "model": os.getenv(
            "LM_STUDIO_MODEL",
            str(nested(config, "inference", "model", "local-model")),
        ),
        "messages": messages,
        "temperature": float(nested(config, "inference", "temperature", 0.15)),
        "max_tokens": int(
            nested(
                config,
                "inference",
                "max_total_new_tokens",
                nested(config, "inference", "max_new_tokens", 1024),
            )
        ),
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"LM Studio returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Cannot reach the local LM Studio server at {base_url}: {error.reason}"
        ) from error
    return str(result["choices"][0]["message"].get("content", ""))


def _transformers_backend(config: dict[str, Any], adapter: str | None) -> tuple[Any, Any, str]:
    from peft import PeftModel

    model_id = model_source(config)
    revision = str(nested(config, "model", "revision", "main"))
    trust_remote_code = bool(nested(config, "model", "trust_remote_code", False))
    tokenizer = load_tokenizer(
        model_id,
        revision,
        trust_remote_code,
        local_files_only=True,
    )
    model, runtime = load_model(
        model_id,
        revision=revision,
        trust_remote_code=trust_remote_code,
        qlora=False,
        local_files_only=True,
    )
    if adapter:
        model = PeftModel.from_pretrained(model, resolve_path(adapter))
    if runtime.device != "cpu":
        model.to(runtime.device)
    model.eval()
    return model, tokenizer, runtime.device


def _transformers_answer(
    config: dict[str, Any],
    messages: list[dict[str, str]],
    backend: tuple[Any, Any, str],
) -> str:
    import torch

    model, tokenizer, device = backend
    text = tokenizer.apply_chat_template(
        fold_system_messages(messages),
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(text, return_tensors="pt", add_special_tokens=False)
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=int(
                nested(
                    config,
                    "inference",
                    "max_total_new_tokens",
                    nested(config, "inference", "max_new_tokens", 1024),
                )
            ),
            do_sample=float(nested(config, "inference", "temperature", 0.15)) > 0,
            temperature=max(float(nested(config, "inference", "temperature", 0.15)), 0.01),
            pad_token_id=tokenizer.pad_token_id,
        )
    return tokenizer.decode(
        output[0, inputs["input_ids"].shape[1] :],
        skip_special_tokens=True,
    )


def _mlx_backend(config: dict[str, Any], adapter: str | None) -> tuple[Any, Any]:
    from mlx_lm import load

    model_id = model_source(config)
    adapter_path = str(resolve_path(adapter)) if adapter else None
    model, tokenizer = load(model_id, adapter_path=adapter_path)
    return model, tokenizer


def _strip_reasoning(text: str) -> str:
    """Remove Gemma-4 thinking channel blocks from generated text.

    Strips complete blocks and trailing incomplete reasoning blocks so that
    truncated generations still return only the final channel content.
    """
    pattern = re.compile(r"<\|channel>thought.*?<channel\|>", re.DOTALL)
    stripped = pattern.sub("", text)
    # If generation was cut off inside a thinking block, drop everything from
    # the opening tag onwards.
    incomplete = re.search(r"<\|channel>thought", stripped)
    if incomplete:
        stripped = stripped[: incomplete.start()]
    return stripped.strip()


def _mlx_answer(
    config: dict[str, Any],
    messages: list[dict[str, str]],
    backend: tuple[Any, Any],
) -> str:
    from mlx_lm import generate
    from mlx_lm.sample_utils import make_sampler

    model, tokenizer = backend
    text = tokenizer.apply_chat_template(
        fold_system_messages(messages),
        tokenize=False,
        add_generation_prompt=True,
    )
    temperature = float(nested(config, "inference", "temperature", 0.15))
    sampler = make_sampler(temp=max(temperature, 0.0))
    generated = generate(
        model,
        tokenizer,
        text,
        max_tokens=int(
            nested(
                config,
                "inference",
                "max_total_new_tokens",
                nested(config, "inference", "max_new_tokens", 1024),
            )
        ),
        sampler=sampler,
        verbose=False,
    )
    return _strip_reasoning(generated)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chat with the configured model and project context")
    parser.add_argument("--config", required=True)
    parser.add_argument("--backend", choices=("lmstudio", "openai", "transformers", "mlx"))
    parser.add_argument("--adapter")
    parser.add_argument("--index")
    parser.add_argument("--prompt", help="One-shot prompt; omit for interactive mode")
    parser.add_argument("--no-rag", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    backend_name = args.backend or str(nested(config, "inference", "backend", "openai"))
    index_path = resolve_path(args.index or nested(config, "data", "index_file"))
    local_backend = None
    if backend_name == "transformers":
        local_backend = _transformers_backend(config, args.adapter)
    elif backend_name == "mlx":
        local_backend = _mlx_backend(config, args.adapter)

    def answer(question: str) -> str:
        context = ""
        if not args.no_rag:
            if not index_path.exists():
                raise FileNotFoundError(
                    f"Source index not found: {index_path}. Run scripts/index.sh first."
                )
            results = search(
                index_path,
                question,
                top_k=int(nested(config, "retrieval", "top_k", 6)),
            )
            context = format_context(
                results,
                max_chars=int(nested(config, "retrieval", "max_context_chars", 18_000)),
            )
        messages = _messages(question, context)
        if backend_name in {"lmstudio", "openai"}:
            return _lmstudio_answer(config, messages)
        if backend_name == "mlx":
            assert local_backend is not None
            return _mlx_answer(config, messages, local_backend)
        assert local_backend is not None
        return _transformers_answer(config, messages, local_backend)

    if args.prompt:
        print(answer(args.prompt))
        return
    print("Fine-tune project chat. Empty input or /quit ends the session.")
    while True:
        try:
            question = input("\nYou> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question or question in {"/quit", "/exit"}:
            break
        print(f"\nModel> {answer(question)}")


if __name__ == "__main__":
    main()
