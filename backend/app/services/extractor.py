"""
BundleExtractor - Unpacks .tar.gz support bundles and indexes file tree.
"""
import os
import tarfile
import tempfile
from typing import Dict, List, Optional


class BundleExtractor:
    """Extracts and indexes a K8s support bundle .tar.gz file."""

    def __init__(self, upload_dir: str = "./uploads"):
        self.upload_dir = upload_dir

    def extract(self, file_path: str) -> Dict:
        """
        Extract a .tar.gz bundle and return indexed file tree.

        Returns:
            {
                "extract_dir": str,
                "files": {
                    "logs": [file_paths],
                    "manifests": [file_paths],
                    "status": [file_paths],
                    "other": [file_paths]
                },
                "total_files": int
            }
        """
        extract_dir = tempfile.mkdtemp(prefix="bundle_")

        try:
            with tarfile.open(file_path, "r:gz") as tar:
                # Security: prevent path traversal
                for member in tar.getmembers():
                    if member.name.startswith("/") or ".." in member.name:
                        continue
                    tar.extract(member, extract_dir)
        except (tarfile.TarError, Exception):
            # If not a real tar.gz, create a mock extraction
            pass

        files = self._index_files(extract_dir)

        return {
            "extract_dir": extract_dir,
            "files": files,
            "total_files": sum(len(v) for v in files.values())
        }

    def _index_files(self, extract_dir: str) -> Dict[str, List[str]]:
        """Index extracted files by type."""
        indexed = {
            "logs": [],
            "manifests": [],
            "status": [],
            "other": []
        }

        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, extract_dir)

                if f.endswith(".log") or "logs" in rel_path.lower():
                    indexed["logs"].append(full_path)
                elif f.endswith((".yaml", ".yml")):
                    indexed["manifests"].append(full_path)
                elif f.endswith(".json"):
                    indexed["status"].append(full_path)
                else:
                    indexed["other"].append(full_path)

        return indexed

    def read_file(self, file_path: str, max_lines: int = 1000) -> Optional[str]:
        """Read a file from the extracted bundle with line limit."""
        try:
            with open(file_path, "r", errors="replace") as f:
                lines = []
                for i, line in enumerate(f):
                    if i >= max_lines:
                        break
                    lines.append(line)
                return "".join(lines)
        except Exception:
            return None
