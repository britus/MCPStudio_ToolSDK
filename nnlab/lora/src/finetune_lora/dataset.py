from __future__ import annotations

import json
import warnings
from copy import deepcopy
from pathlib import Path
from typing import Any


def fold_system_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    system_text = "\n\n".join(
        str(message.get("content", ""))
        for message in messages
        if message.get("role") == "system"
    ).strip()
    remaining = [dict(message) for message in messages if message.get("role") != "system"]
    if not system_text:
        return remaining
    prefix = f"System instructions:\n{system_text}"
    for message in remaining:
        if message.get("role") == "user":
            message["content"] = f"{prefix}\n\nUser request:\n{message.get('content', '')}"
            return remaining
    return [{"role": "user", "content": prefix}, *remaining]


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with Path(path).open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON in {path}:{line_number}: {error}") from error
            if not isinstance(record.get("prompt"), list) or not isinstance(
                record.get("completion"), list
            ):
                raise TypeError(
                    f"{path}:{line_number} must contain prompt and completion message lists"
                )
            records.append(record)
    return records


def _rendered_token_count(record: dict[str, Any], tokenizer: Any) -> int:
    prompt_messages = fold_system_messages(record["prompt"])
    full_messages = prompt_messages + fold_system_messages(record["completion"])
    text = tokenizer.apply_chat_template(
        full_messages,
        tokenize=False,
        add_generation_prompt=False,
    )
    return len(tokenizer(text, add_special_tokens=False)["input_ids"])


def _text_boundaries(text: str) -> list[tuple[int, int]]:
    """Return natural split offsets and their preference rank.

    Paragraph and sentence ends rank above physical lines and ordinary word
    boundaries. The returned offset includes following whitespace so joining
    all chunks reproduces the original completion exactly.
    """
    boundaries: list[tuple[int, int]] = []
    index = 0
    sentence_endings = frozenset(".!?。！？")
    closing_marks = frozenset("\"'’”)]}»")
    while index < len(text):
        if not text[index].isspace():
            index += 1
            continue
        whitespace_start = index
        while index < len(text) and text[index].isspace():
            index += 1
        preceding = whitespace_start - 1
        while preceding >= 0 and text[preceding] in closing_marks:
            preceding -= 1
        whitespace = text[whitespace_start:index]
        if "\n\n" in whitespace or "\r\n\r\n" in whitespace:
            rank = 4
        elif preceding >= 0 and text[preceding] in sentence_endings:
            rank = 3
        elif "\n" in whitespace or "\r" in whitespace:
            rank = 2
        else:
            rank = 1
        boundaries.append((index, rank))
    if not boundaries or boundaries[-1][0] != len(text):
        boundaries.append((len(text), 5))
    return boundaries


def _record_with_completion(record: dict[str, Any], content: str) -> dict[str, Any]:
    split = deepcopy(record)
    split["completion"][0]["content"] = content
    return split


def _continuation_base_record(
    record: dict[str, Any],
    previous_segment: str,
    tokenizer: Any,
    max_length: int,
) -> dict[str, Any]:
    """Create a bounded, token-checked continuation prompt for a later segment."""
    base = deepcopy(record)
    context = previous_segment[-2000:]
    instruction = (
        "\n\nContinuation context (the preceding answer segment ended with):\n"
        "---\n{context}\n---\n"
        "Continue directly after that context without repeating it."
    )
    user_messages = [
        message for message in base["prompt"] if message.get("role") == "user"
    ]
    if not user_messages:
        user_messages = [{"role": "user", "content": "Continue the answer."}]
        base["prompt"].append(user_messages[0])
    original = str(user_messages[-1].get("content", ""))
    minimum_completion_room = max(8, min(128, max_length // 8))
    while context:
        user_messages[-1]["content"] = original + instruction.format(context=context)
        empty = _record_with_completion(base, "")
        if _rendered_token_count(empty, tokenizer) <= max_length - minimum_completion_room:
            return base
        # Retain the most recent context because it immediately precedes the
        # target continuation. Dropping from the left cannot lose target text.
        context = context[max(1, len(context) // 4) :]
    user_messages[-1]["content"] = original + "\n\nContinue with the next answer segment."
    if (
        _rendered_token_count(_record_with_completion(base, ""), tokenizer)
        <= max_length - minimum_completion_room
    ):
        return base
    user_messages[-1]["content"] = original
    return base


def split_record(
    record: dict[str, Any],
    tokenizer: Any,
    max_length: int,
) -> list[dict[str, Any]]:
    """Split a long completion into independently trainable, complete records.

    Splits are selected by rendered token count, prefer paragraph/sentence
    boundaries, and never silently discard tokens. Each segment retains the
    original prompt and receives auditable segment metadata.
    """
    if max_length < 1:
        raise ValueError("max_length must be positive")
    completion = record.get("completion")
    if (
        not isinstance(completion, list)
        or len(completion) != 1
        or completion[0].get("role") != "assistant"
        or not isinstance(completion[0].get("content"), str)
    ):
        raise ValueError(
            "Token-aware splitting requires exactly one assistant completion message"
        )
    if _rendered_token_count(record, tokenizer) <= max_length:
        return [deepcopy(record)]

    content = completion[0]["content"]
    boundaries = _text_boundaries(content)
    segment_records: list[dict[str, Any]] = []
    start = 0
    while start < len(content):
        segment_base = (
            record
            if not segment_records
            else _continuation_base_record(
                record,
                str(segment_records[-1]["completion"][0]["content"]),
                tokenizer,
                max_length,
            )
        )
        remaining = [(offset, rank) for offset, rank in boundaries if offset > start]
        low = 0
        high = len(remaining)
        while low < high:
            middle = (low + high) // 2
            candidate = content[start : remaining[middle][0]]
            if _rendered_token_count(
                _record_with_completion(segment_base, candidate), tokenizer
            ) <= max_length:
                low = middle + 1
            else:
                high = middle
        fitting = remaining[:low]
        if fitting:
            furthest = fitting[-1][0]
            preferred_start = start + int((furthest - start) * 0.65)
            preferred = [item for item in fitting if item[0] >= preferred_start]
            cut, _ = max(preferred, key=lambda item: (item[1], item[0]))
        else:
            # A completion may contain one exceptionally long token/string with
            # no natural boundary. Fall back to a character cut, still verified
            # against the rendered token budget and without losing content.
            char_low = start + 1
            char_high = len(content) + 1
            while char_low < char_high:
                middle = (char_low + char_high) // 2
                candidate = content[start:middle]
                if _rendered_token_count(
                    _record_with_completion(segment_base, candidate), tokenizer
                ) <= max_length:
                    char_low = middle + 1
                else:
                    char_high = middle
            cut = char_low - 1
            if cut <= start:
                raise ValueError(
                    "The rendered prompt alone fills max_length; shorten the prompt or "
                    f"increase data.max_seq_length | char_low={char_low} cut={cut} start={start}"
                )
        segment_records.append(
            _record_with_completion(segment_base, content[start:cut])
        )
        start = cut

    split_records: list[dict[str, Any]] = []
    count = len(segment_records)
    for index, split in enumerate(segment_records, 1):
        metadata = dict(split.get("metadata") or {})
        metadata.update(
            {
                "sequence_segment": index,
                "sequence_segments": count,
                "sequence_split": "token-aware-natural-boundary",
            }
        )
        split["metadata"] = metadata
        split_records.append(split)
    return split_records


def encode_record(record: dict[str, Any], tokenizer: Any, max_length: int) -> dict[str, list[int]]:
    prompt_messages = fold_system_messages(record["prompt"])
    full_messages = prompt_messages + fold_system_messages(record["completion"])
    prompt_text = tokenizer.apply_chat_template(
        prompt_messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    full_text = tokenizer.apply_chat_template(
        full_messages,
        tokenize=False,
        add_generation_prompt=False,
    )
    prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]
    if len(full_ids) > max_length:
        raise ValueError(
            f"Record has {len(full_ids)} rendered tokens, exceeding max_length={max_length}; "
            "split it with split_record first"
        )

    common_prefix = 0
    for prompt_token, full_token in zip(prompt_ids, full_ids, strict=False):
        if prompt_token != full_token:
            break
        common_prefix += 1
    labels = [-100] * common_prefix + full_ids[common_prefix:]
    if not any(label != -100 for label in labels):
        raise ValueError(
            "A record has no completion tokens after rendering; shorten the prompt, "
            "reduce chunk size, or increase data.max_seq_length"
        )
    return {
        "input_ids": full_ids,
        "attention_mask": [1] * len(full_ids),
        "labels": labels,
    }


class CompletionDataset:
    def __init__(self, path: str | Path, tokenizer: Any, max_length: int):
        records = read_jsonl(path)
        if not records:
            raise ValueError(f"Dataset is empty: {path}")
        self.items = []
        split_records = 0
        for record in records:
            segments = split_record(record, tokenizer, max_length)
            self.items.extend(
                encode_record(segment, tokenizer, max_length) for segment in segments
            )
            split_records += len(segments) - 1
        if not self.items:
            raise ValueError(
                f"Dataset contains no trainable records: {path}"
            )
        if split_records:
            warnings.warn(
                f"Created {split_records} additional natural-boundary segments from long "
                f"records in {path}; no completion content was discarded",
                stacklevel=2,
            )

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> dict[str, list[int]]:
        return self.items[index]


class CompletionCollator:
    def __init__(self, tokenizer: Any):
        self.tokenizer = tokenizer

    def __call__(self, features: list[dict[str, list[int]]]) -> dict[str, Any]:
        import torch

        max_length = max(len(feature["input_ids"]) for feature in features)
        pad_id = self.tokenizer.pad_token_id
        batch = {"input_ids": [], "attention_mask": [], "labels": []}
        for feature in features:
            padding = max_length - len(feature["input_ids"])
            batch["input_ids"].append(feature["input_ids"] + [pad_id] * padding)
            batch["attention_mask"].append(feature["attention_mask"] + [0] * padding)
            batch["labels"].append(feature["labels"] + [-100] * padding)
        return {key: torch.tensor(value, dtype=torch.long) for key, value in batch.items()}
