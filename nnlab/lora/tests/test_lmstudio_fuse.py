import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

from finetune_lora.lmstudio_fuse import (
    build_plan,
    install_fused_model,
    normalize_model_name,
    resolve_adapter,
)


class LMStudioFuseTests(unittest.TestCase):
    @staticmethod
    def _write_safetensors(path: Path, tensors: dict[str, bytes]) -> None:
        header = {"__metadata__": {"format": "mlx"}}
        offset = 0
        for key, data in tensors.items():
            header[key] = {
                "dtype": "U8",
                "shape": [len(data)],
                "data_offsets": [offset, offset + len(data)],
            }
            offset += len(data)
        encoded = json.dumps(header, separators=(",", ":")).encode()
        encoded += b" " * (-len(encoded) % 8)
        with path.open("wb") as handle:
            handle.write(struct.pack("<Q", len(encoded)))
            handle.write(encoded)
            for data in tensors.values():
                handle.write(data)

    @staticmethod
    def _fake_fuse(command) -> None:
        output = Path(command[command.index("--save-path") + 1])
        output.mkdir()
        (output / "config.json").write_text('{"model_type":"gemma4"}')
        (output / "tokenizer.json").write_text("{}")
        (output / "tokenizer_config.json").write_text("{}")
        (output / "model-00001-of-00001.safetensors").write_bytes(b"fused")
        (output / "model.safetensors.index.json").write_text(
            json.dumps(
                {
                    "metadata": {"total_size": 0},
                    "weight_map": {
                        "language_model.model.layers.0.weight": (
                            "model-00001-of-00001.safetensors"
                        )
                    },
                }
            )
        )

    def _fixture(self, root: Path) -> tuple[Path, Path, Path, Path]:
        base = root / "base-model"
        base.mkdir()
        config = {
            "model_type": "gemma4",
            "text_config": {"max_position_embeddings": 262144},
            "vision_config": {"model_type": "gemma4_vision"},
            "quantization": {"bits": 4, "group_size": 64},
        }
        (base / "config.json").write_text(json.dumps(config))
        self._write_safetensors(
            base / "model-base.safetensors",
            {
                "language_model.model.layers.0.weight": b"language",
                "vision_tower.encoder.layers.0.weight": b"vision",
            },
        )
        (base / "model.safetensors.index.json").write_text(
            json.dumps(
                {
                    "metadata": {"total_size": 14},
                    "weight_map": {
                        "language_model.model.layers.0.weight": "model-base.safetensors",
                        "vision_tower.encoder.layers.0.weight": "model-base.safetensors",
                    },
                }
            )
        )
        (base / "tokenizer.json").write_text("{}")
        canonical_template = (
            "{{ bos_token }}<|channel>thought<channel|>"
            "{% if enable_thinking %}<|think|>{% endif %}"
            "<|tool_call><tool_call|>"
        )
        (base / "chat_template.jinja").write_text("old-template")
        (base / "gemma-4-chat-template-fixed.jinja").write_text(canonical_template)
        (base / "tokenizer_config.json").write_text(
            json.dumps({"chat_template": "broken-embedded-template"})
        )
        (base / "processor_config.json").write_text('{"processor_class":"Gemma4Processor"}')

        adapter = root / "finetune_lora"
        adapter.mkdir()
        (adapter / "adapter_config.json").write_text("{}")
        (adapter / "adapters.safetensors").write_bytes(b"adapter")
        (adapter / "train_setup.json").write_text(json.dumps({"model": str(base)}))

        lmstudio = root / ".lmstudio"
        lmstudio.mkdir()
        fuse = root / "mlx_lm.fuse"
        fuse.write_text("#!/bin/sh\n")
        fuse.chmod(0o755)
        return base, adapter, lmstudio, fuse

    def test_model_name_always_has_eof_nnl_prefix(self) -> None:
        adapter = Path("finetune_lora")
        self.assertEqual(normalize_model_name(None, adapter), "eofnnlab-finetune_lora")
        self.assertEqual(
            normalize_model_name("eofnnlab-Carios", adapter), "eofnnlab-Carios"
        )

    def test_hub_identifier_is_normalized_to_kebab_case(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, adapter, lmstudio, _ = self._fixture(root)

            plan = build_plan(
                adapter=adapter,
                lmstudio_root=lmstudio,
                model_name="Carios_Code.v2",
            )

            self.assertEqual(plan.model_name, "eofnnlab-Carios_Code.v2")
            self.assertEqual(plan.hub_name, "carios-code-v2")
            self.assertEqual(plan.hub_model_id, "eofnnlab/carios-code-v2")
            self.assertNotEqual(
                plan.hub_model_id.casefold(),
                plan.concrete_model_key.casefold(),
            )
            self.assertEqual(
                plan.user_defaults_path,
                lmstudio.resolve()
                / ".internal/user-concrete-model-default-config/eofnnlab"
                / "eofnnlab-Carios_Code.v2.json",
            )

    def test_adapter_is_read_from_config_when_not_provided(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            adapter = root / "config-adapter"
            adapter.mkdir()
            (adapter / "adapter_config.json").write_text("{}")
            (adapter / "adapters.safetensors").write_bytes(b"adapter")
            (adapter / "train_setup.json").write_text(json.dumps({"model": "/no-such-path"}))
            config_path = root / "project.toml"
            config_path.write_text(
                '[training]\noutput_dir = "config-adapter"\n[model]\nid = "/no-such-path"\n'
            )

            original_cwd = os.getcwd()
            os.chdir(root)
            try:
                resolved = resolve_adapter(
                    None,
                    {
                        "training": {"output_dir": "config-adapter"},
                        "_config_path": str(config_path),
                    },
                    config_path,
                )
            finally:
                os.chdir(original_cwd)

            self.assertEqual(resolved, adapter.resolve())

    def test_adapter_path_resolves_relative_to_cwd_not_config_dir(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_dir = root / "config"
            config_dir.mkdir()
            adapter = root / "artifacts" / "my-adapter"
            adapter.mkdir(parents=True)
            (adapter / "adapter_config.json").write_text("{}")
            (adapter / "adapters.safetensors").write_bytes(b"adapter")
            config_path = config_dir / "project.toml"
            config_path.write_text('[training]\noutput_dir = "artifacts/my-adapter"\n')

            original_cwd = os.getcwd()
            os.chdir(root)
            try:
                resolved = resolve_adapter(
                    None,
                    {
                        "training": {"output_dir": "artifacts/my-adapter"},
                        "_config_path": str(config_path),
                    },
                    config_path,
                )
            finally:
                os.chdir(original_cwd)

            self.assertEqual(resolved, adapter.resolve())

    def test_installs_new_model_and_hub_registration_without_touching_base(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, adapter, lmstudio, fuse = self._fixture(root)
            original_config = (base / "config.json").read_bytes()
            plan = build_plan(adapter=adapter, lmstudio_root=lmstudio, model_name="carios")

            result = install_fused_model(
                plan,
                fuse_executable=fuse,
                run_fuse=self._fake_fuse,
            )

            self.assertEqual(result.plan.model_name, "eofnnlab-carios")
            self.assertEqual((base / "config.json").read_bytes(), original_config)
            self.assertEqual((plan.model_path / "config.json").read_bytes(), original_config)
            self.assertTrue((plan.model_path / "processor_config.json").is_file())
            self.assertIn("enable_thinking", (plan.model_path / "chat_template.jinja").read_text())
            installed_tokenizer_config = json.loads(
                (plan.model_path / "tokenizer_config.json").read_text()
            )
            self.assertEqual(
                installed_tokenizer_config["chat_template"],
                (base / "gemma-4-chat-template-fixed.jinja").read_text(),
            )
            fused_index = json.loads((plan.model_path / "model.safetensors.index.json").read_text())
            preserved_shard = fused_index["weight_map"][
                "vision_tower.encoder.layers.0.weight"
            ]
            self.assertTrue((plan.model_path / preserved_shard).is_file())
            self.assertEqual(fused_index["metadata"]["total_size"], 6)
            model_yaml = (plan.hub_path / "model.yaml").read_text()
            self.assertIn('model: "eofnnlab/carios"', model_yaml)
            self.assertIn('key: "eofnnlab/eofnnlab-carios"', model_yaml)
            self.assertIn("llm.prediction.reasoning.parsing", model_yaml)
            self.assertIn("llm.prediction.promptTemplate", model_yaml)
            manifest = json.loads((plan.hub_path / "manifest.json").read_text())
            self.assertEqual(manifest["type"], "model")
            self.assertEqual(manifest["owner"], "eofnnlab")
            self.assertEqual(
                manifest["dependencies"][0]["modelKeys"],
                ["eofnnlab/eofnnlab-carios"],
            )
            defaults = json.loads(plan.user_defaults_path.read_text())
            default_fields = defaults["operation"]["fields"]
            self.assertEqual(
                [field["key"] for field in default_fields],
                [
                    "llm.prediction.reasoning.parsing",
                    "llm.prediction.promptTemplate",
                ],
            )
            self.assertEqual(
                default_fields[0]["value"],
                {
                    "enabled": True,
                    "startString": "<|channel>thought",
                    "endString": "<channel|>",
                },
            )

    def test_refuses_to_overwrite_existing_model(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, adapter, lmstudio, fuse = self._fixture(root)
            plan = build_plan(adapter=adapter, lmstudio_root=lmstudio, model_name="existing")
            plan.model_path.mkdir(parents=True)

            with self.assertRaisesRegex(FileExistsError, "Refusing to overwrite"):
                install_fused_model(plan, fuse_executable=fuse, run_fuse=lambda _: None)

    def test_transactionally_replaces_existing_installation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, adapter, lmstudio, fuse = self._fixture(root)
            plan = build_plan(adapter=adapter, lmstudio_root=lmstudio, model_name="existing")
            plan.model_path.mkdir(parents=True)
            (plan.model_path / "stale.txt").write_text("old model")
            plan.hub_path.mkdir(parents=True)
            (plan.hub_path / "stale.txt").write_text("old hub")
            plan.user_defaults_path.parent.mkdir(parents=True)
            plan.user_defaults_path.write_text(
                json.dumps(
                    {
                        "preset": "keep-me",
                        "operation": {"fields": []},
                        "load": {"fields": []},
                    }
                )
            )

            install_fused_model(
                plan,
                fuse_executable=fuse,
                run_fuse=self._fake_fuse,
                replace=True,
            )

            self.assertFalse((plan.model_path / "stale.txt").exists())
            self.assertTrue((plan.model_path / "eof_nnl_install.json").is_file())
            self.assertFalse((plan.hub_path / "stale.txt").exists())
            self.assertTrue((plan.hub_path / "manifest.json").is_file())
            defaults = json.loads(plan.user_defaults_path.read_text())
            self.assertEqual(defaults["preset"], "keep-me")
            self.assertEqual(
                list(plan.model_path.parent.glob(f".{plan.model_name}.backup-*")),
                [],
            )
            self.assertEqual(
                list(plan.hub_path.parent.glob(f".{plan.hub_name}.backup-*")),
                [],
            )

    def test_merges_existing_user_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, adapter, lmstudio, fuse = self._fixture(root)
            plan = build_plan(adapter=adapter, lmstudio_root=lmstudio, model_name="existing")
            plan.user_defaults_path.parent.mkdir(parents=True)
            plan.user_defaults_path.write_text(
                json.dumps(
                    {
                        "preset": "custom-preset",
                        "operation": {
                            "fields": [
                                {
                                    "key": "llm.prediction.temperature",
                                    "value": 0.25,
                                }
                            ]
                        },
                        "load": {
                            "fields": [{"key": "llm.load.contextLength", "value": 8192}]
                        },
                        "userMetadata": {"keep": True},
                    }
                )
            )

            install_fused_model(
                plan,
                fuse_executable=fuse,
                run_fuse=self._fake_fuse,
            )

            defaults = json.loads(plan.user_defaults_path.read_text())
            self.assertEqual(defaults["preset"], "custom-preset")
            self.assertEqual(defaults["load"]["fields"][0]["value"], 8192)
            self.assertEqual(defaults["userMetadata"], {"keep": True})
            self.assertEqual(
                [field["key"] for field in defaults["operation"]["fields"]],
                [
                    "llm.prediction.reasoning.parsing",
                    "llm.prediction.promptTemplate",
                    "llm.prediction.temperature",
                ],
            )

    def test_base_model_is_read_from_training_setup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, adapter, lmstudio, _ = self._fixture(root)

            plan = build_plan(adapter=adapter, lmstudio_root=lmstudio)

            self.assertEqual(plan.base_model, base.resolve())


if __name__ == "__main__":
    unittest.main()
