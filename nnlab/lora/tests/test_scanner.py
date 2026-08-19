import subprocess
import tempfile
import unittest
from pathlib import Path

from finetune_lora.scanner import language_for, scan_project


class ScannerTests(unittest.TestCase):
    def test_scanner_walks_an_ignored_subdirectory_inside_a_git_repository(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            subprocess.run(
                ["git", "init", "--quiet", str(repository)],
                check=True,
                capture_output=True,
            )
            (repository / ".gitignore").write_text("data/\n")
            staging = repository / "data" / "prepared_docs" / "run-1"
            document = staging / "document-001" / "manual.txt"
            document.parent.mkdir(parents=True)
            document.write_text("Prepared document content.\n")

            sources, skipped = scan_project(staging)

            self.assertEqual(
                [item.relative_path for item in sources],
                ["document-001/manual.txt"],
            )
            self.assertEqual(skipped, [])

    def test_scanner_accepts_common_qt_source_types_from_central_mapping(self) -> None:
        qt_types = {
            "app.pro": "qmake",
            "common.pri": "qmake",
            "feature.prf": "qmake",
            "resources.qrc": "xml",
            "Main.qml": "qml",
            "module.qmltypes": "qml",
            "theme.qss": "css",
            "guide.qdoc": "qdoc",
            "docs.qdocconf": "qdoc",
            "shared.qdocinc": "qdoc",
            "help.qhp": "xml",
            "help.qhcp": "xml",
            "application.qmlproject": "qml",
            "script.qs": "javascript",
            "QtFeature.cmake": "cmake",
            "form.ui": "xml",
            "qmldir": "qml",
            ".qmake.conf": "qmake",
        }
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            for filename in qt_types:
                (project / filename).write_text(f"source for {filename}\n")

            sources, skipped = scan_project(project)

            self.assertEqual(
                {item.relative_path for item in sources},
                set(qt_types),
            )
            self.assertEqual(
                {filename: language_for(filename) for filename in qt_types},
                qt_types,
            )
            self.assertEqual(skipped, [])

    def test_scanner_accepts_qt_designer_ui_as_xml(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "network.ui"
            source.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<ui version="4.0"><class>NetworkView</class></ui>\n'
            )

            sources, skipped = scan_project(source)

            self.assertEqual([item.relative_path for item in sources], ["network.ui"])
            self.assertEqual(language_for("network.ui"), "xml")
            self.assertEqual(skipped, [])

    def test_scanner_accepts_an_individual_source_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory) / "sample"
            project.mkdir()
            source = project / "Service.swift"
            source.write_text("struct Service {}\n")
            (project / "Ignored.swift").write_text("struct Ignored {}\n")

            sources, skipped = scan_project(source)

            self.assertEqual([item.relative_path for item in sources], ["Service.swift"])
            self.assertEqual(sources[0].root, project.resolve())
            self.assertEqual(sources[0].project, "sample")
            self.assertEqual(skipped, [])

    def test_scanner_excludes_secrets_binary_and_build(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            (tmp_path / "app.py").write_text("def answer():\n    return 42\n")
            (tmp_path / ".env").write_text("TOKEN=secret\n")
            (tmp_path / "private.py").write_text(
                "KEY = '''-----BEGIN PRIVATE KEY-----\\nabc\\n'''\n"
            )
            (tmp_path / "image.py").write_bytes(b"abc\0def")
            build = tmp_path / "build"
            build.mkdir()
            (build / "generated.py").write_text("bad = True\n")

            sources, skipped = scan_project(tmp_path)

            self.assertEqual([source.relative_path for source in sources], ["app.py"])
            reasons = {item.relative_path: item.reason for item in skipped}
            self.assertEqual(reasons[".env"], "sensitive filename")
            self.assertEqual(reasons["private.py"], "possible embedded secret")
            self.assertEqual(reasons["image.py"], "binary")
            self.assertNotIn("build/generated.py", reasons)

    def test_scanner_excludes_dataset_policy_control_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "manual.txt").write_text("Authoritative document.\n")
            (project / "dataset-policy.json").write_text(
                '{"requiredSubjects": ["subject-a"]}\n'
            )

            sources, skipped = scan_project(project)

            self.assertEqual(
                [source.relative_path for source in sources],
                ["manual.txt"],
            )
            reasons = {item.relative_path: item.reason for item in skipped}
            self.assertEqual(
                reasons["dataset-policy.json"],
                "workflow control file",
            )


if __name__ == "__main__":
    unittest.main()
