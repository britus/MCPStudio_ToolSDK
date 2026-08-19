import json
import tempfile
import unittest
from pathlib import Path

import mlx.core as mx

from finetune_lora.merge_adapters import merge_adapters, merge_tensors


def _write_adapter(
    path: Path,
    *,
    rank: int = 2,
    scale: float = 2.0,
    num_layers: int = 2,
    seed: int = 0,
    drop_keys: tuple[str, ...] = (),
    model: str = "/base/model",
) -> None:
    """Create a minimal but structurally valid MLX LoRA adapter directory."""
    path.mkdir(parents=True, exist_ok=True)
    keys = {
        # Dense LoRALinear layout: lora_a (in, rank), lora_b (rank, out).
        "language_model.model.layers.0.mlp.gate_proj.lora_a": (4, rank),
        "language_model.model.layers.0.mlp.gate_proj.lora_b": (rank, 6),
        # Expert LoRASwitchLinear layout: lora_a (E, rank, in), lora_b (E, out, rank).
        "language_model.model.layers.0.experts.switch_glu.down_proj.lora_a": (3, rank, 5),
        "language_model.model.layers.0.experts.switch_glu.down_proj.lora_b": (3, 7, rank),
    }
    mx.random.seed(seed)
    tensors = {
        key: mx.random.uniform(shape=shape) for key, shape in keys.items() if key not in drop_keys
    }
    mx.save_safetensors(str(path / "adapters.safetensors"), tensors)
    (path / "adapter_config.json").write_text(
        json.dumps(
            {
                "adapter_path": str(path),
                "fine_tune_type": "lora",
                "num_layers": num_layers,
                "lora_parameters": {
                    "rank": rank,
                    "scale": scale,
                    "dropout": 0.0,
                },
            }
        )
    )
    (path / "train_setup.json").write_text(json.dumps({"model": model}))


def _dense_delta(lora_a: mx.array, lora_b: mx.array, scale: float) -> mx.array:
    """Reference LoRALinear.fuse delta: scale * lora_b.T @ lora_a.T."""
    return scale * lora_b.T @ lora_a.T


def _expert_delta(lora_a: mx.array, lora_b: mx.array, scale: float) -> mx.array:
    """Reference LoRASwitchLinear.fuse delta: scale * lora_b @ lora_a."""
    return scale * lora_b @ lora_a


class MergeAdaptersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        try:
            mx.zeros((1,))
        except RuntimeError as error:
            if "No Metal device available" in str(error):
                raise unittest.SkipTest(
                    "MLX merge tests require a Metal device"
                ) from error
            raise

    def test_merges_adapters_into_combined_rank_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            adapter_a = root / "adapter_a"
            adapter_b = root / "adapter_b"
            _write_adapter(master, seed=1)
            _write_adapter(adapter_a, seed=2)
            _write_adapter(adapter_b, seed=3)
            output = root / "merged"

            report = merge_adapters(master, [adapter_a, adapter_b], None, output)

            merged = mx.load(str(output / "adapters.safetensors"))
            self.assertEqual(report["base_rank"], 2)
            self.assertEqual(report["merged_rank"], 6)
            self.assertEqual(report["tensor_count"], 4)
            self.assertEqual(
                list(merged["language_model.model.layers.0.mlp.gate_proj.lora_a"].shape),
                [4, 6],
            )
            self.assertEqual(
                list(merged["language_model.model.layers.0.mlp.gate_proj.lora_b"].shape),
                [6, 6],
            )
            self.assertEqual(
                list(
                    merged[
                        "language_model.model.layers.0.experts.switch_glu.down_proj.lora_a"
                    ].shape
                ),
                [3, 6, 5],
            )
            self.assertEqual(
                list(
                    merged[
                        "language_model.model.layers.0.experts.switch_glu.down_proj.lora_b"
                    ].shape
                ),
                [3, 7, 6],
            )
            config = json.loads((output / "adapter_config.json").read_text())
            self.assertEqual(config["lora_parameters"]["rank"], 6)
            self.assertEqual(config["lora_parameters"]["scale"], 2.0)
            self.assertEqual(config["num_layers"], 2)
            self.assertTrue((output / "merge_report.json").is_file())

    def test_merged_delta_equals_weighted_sum_of_source_deltas(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master, seed=11)
            _write_adapter(other, seed=13)
            output = root / "merged"
            weights = [1.0, 0.5]

            merge_adapters(master, [other], weights, output)

            scale = 2.0
            sources = [mx.load(str(path / "adapters.safetensors")) for path in (master, other)]
            merged = mx.load(str(output / "adapters.safetensors"))
            dense = "language_model.model.layers.0.mlp.gate_proj"
            expert = "language_model.model.layers.0.experts.switch_glu.down_proj"

            expected_dense = sum(
                weight * _dense_delta(source[f"{dense}.lora_a"], source[f"{dense}.lora_b"], scale)
                for source, weight in zip(sources, weights, strict=True)
            )
            merged_dense = _dense_delta(merged[f"{dense}.lora_a"], merged[f"{dense}.lora_b"], scale)
            self.assertTrue(bool(mx.allclose(merged_dense, expected_dense, atol=1e-5)))

            expected_expert = sum(
                weight
                * _expert_delta(source[f"{expert}.lora_a"], source[f"{expert}.lora_b"], scale)
                for source, weight in zip(sources, weights, strict=True)
            )
            merged_expert = _expert_delta(
                merged[f"{expert}.lora_a"], merged[f"{expert}.lora_b"], scale
            )
            self.assertTrue(bool(mx.allclose(merged_expert, expected_expert, atol=1e-5)))

    def test_in_place_merge_replaces_master_and_records_source_hash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master, seed=21)
            _write_adapter(other, seed=22)
            original = (master / "adapters.safetensors").read_bytes()

            report = merge_adapters(master, [other], None, None, in_place=True)

            self.assertEqual(report["output"], str(master.resolve()))
            self.assertNotEqual((master / "adapters.safetensors").read_bytes(), original)
            self.assertIn(str(master.resolve()), report["sources_sha256"])
            config = json.loads((master / "adapter_config.json").read_text())
            self.assertEqual(config["lora_parameters"]["rank"], 4)
            # No staging files may survive a successful in-place merge.
            self.assertEqual([p.name for p in master.glob("*.tmp-*")], [])

    def test_refreshes_trailing_components_of_an_already_merged_master(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            old_adapter_a = root / "old-adapter_a"
            old_adapter_b = root / "old-adapter_b"
            new_adapter_a = root / "new-adapter_a"
            new_adapter_b = root / "new-adapter_b"
            for path, seed in (
                (master, 30),
                (old_adapter_a, 31),
                (old_adapter_b, 32),
                (new_adapter_a, 41),
                (new_adapter_b, 42),
            ):
                _write_adapter(path, seed=seed)

            old_weights = [0.2, 0.3, 0.5]
            merge_adapters(
                master,
                [old_adapter_a, old_adapter_b],
                old_weights,
                None,
                in_place=True,
            )
            merged_before = mx.load(str(master / "adapters.safetensors"))
            new_weights = [0.25, 0.35, 0.4]

            report = merge_adapters(
                master,
                [new_adapter_a, new_adapter_b],
                new_weights,
                root / "refreshed",
            )

            refreshed = mx.load(str(root / "refreshed" / "adapters.safetensors"))
            new_sources = [
                mx.load(str(path / "adapters.safetensors")) for path in (new_adapter_a, new_adapter_b)
            ]
            dense = "language_model.model.layers.0.mlp.gate_proj"
            preserved_a = merged_before[f"{dense}.lora_a"][:, :2]
            preserved_b = merged_before[f"{dense}.lora_b"][:2, :]
            expected = _dense_delta(
                preserved_a,
                preserved_b * (new_weights[0] / old_weights[0]),
                2.0,
            ) + sum(
                weight * _dense_delta(source[f"{dense}.lora_a"], source[f"{dense}.lora_b"], 2.0)
                for source, weight in zip(new_sources, new_weights[1:], strict=True)
            )
            actual = _dense_delta(
                refreshed[f"{dense}.lora_a"],
                refreshed[f"{dense}.lora_b"],
                2.0,
            )
            self.assertTrue(bool(mx.allclose(actual, expected, atol=1e-5)))
            self.assertEqual(report["method"], "lora-component-refresh")
            self.assertEqual(report["base_rank"], 2)
            self.assertEqual(report["merged_rank"], 6)
            self.assertEqual(report["weights"], new_weights)
            self.assertEqual(
                report["adapters"][-2:], [str(new_adapter_a.resolve()), str(new_adapter_b.resolve())]
            )
            self.assertIn("refreshed_from_sha256", report)

    def test_refuses_rank_mismatch_when_master_has_no_merge_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master, rank=4)
            _write_adapter(other, rank=2)

            with self.assertRaisesRegex(ValueError, "no merge provenance"):
                merge_adapters(master, [other], None, root / "merged")

    def test_refuses_non_empty_output_without_force(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master)
            _write_adapter(other)
            output = root / "merged"
            output.mkdir()
            (output / "stale.txt").write_text("stale")

            with self.assertRaisesRegex(FileExistsError, "not empty"):
                merge_adapters(master, [other], None, output)

    def test_rejects_rank_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master, rank=2)
            _write_adapter(other, rank=4)

            with self.assertRaisesRegex(ValueError, "rank mismatch"):
                merge_adapters(master, [other], None, root / "merged")

    def test_rejects_base_model_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master, model="/base/a")
            _write_adapter(other, model="/base/b")

            with self.assertRaisesRegex(ValueError, "Base model mismatch"):
                merge_adapters(master, [other], None, root / "merged")

    def test_rejects_tensor_key_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master)
            _write_adapter(
                other,
                drop_keys=("language_model.model.layers.0.mlp.gate_proj.lora_a",),
            )

            with self.assertRaisesRegex(ValueError, "tensor keys differ"):
                merge_adapters(master, [other], None, root / "merged")

    def test_rejects_weights_length_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "master"
            other = root / "other"
            _write_adapter(master)
            _write_adapter(other)

            with self.assertRaisesRegex(ValueError, "weights"):
                merge_adapters(master, [other], [1.0, 1.0, 1.0], root / "merged")

    def test_rejects_unknown_tensor_suffix(self) -> None:
        tensors = [
            {"layer.extra": mx.zeros((4, 2))},
            {"layer.extra": mx.zeros((4, 2))},
        ]
        with self.assertRaisesRegex(ValueError, "Unsupported adapter tensor"):
            merge_tensors(tensors, [1.0, 1.0], rank=2)


if __name__ == "__main__":
    unittest.main()
