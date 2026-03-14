"""
SignalExtractor - Pulls structured signals from bundle contents.
Deterministic extraction, no LLM cost.
"""
import re
import json
import os
from typing import Dict, List, Any


class SignalExtractor:
    """Extract structured K8s signals from support bundle files."""

    # Patterns for detecting K8s issues in logs and manifests
    OOMKILL_PATTERNS = [
        re.compile(r"OOMKilled", re.IGNORECASE),
        re.compile(r"Out of memory", re.IGNORECASE),
        re.compile(r"oom-kill", re.IGNORECASE),
        re.compile(r"memory cgroup out of memory", re.IGNORECASE),
    ]

    CRASHLOOP_PATTERNS = [
        re.compile(r"CrashLoopBackOff", re.IGNORECASE),
        re.compile(r"Back-off restarting failed container", re.IGNORECASE),
    ]

    IMAGE_PULL_PATTERNS = [
        re.compile(r"ImagePullBackOff", re.IGNORECASE),
        re.compile(r"ErrImagePull", re.IGNORECASE),
        re.compile(r"Failed to pull image", re.IGNORECASE),
    ]

    NODE_PRESSURE_PATTERNS = [
        re.compile(r"DiskPressure", re.IGNORECASE),
        re.compile(r"MemoryPressure", re.IGNORECASE),
        re.compile(r"PIDPressure", re.IGNORECASE),
        re.compile(r"NodeNotReady", re.IGNORECASE),
        re.compile(r"condition.*NotReady", re.IGNORECASE),
    ]

    PVC_PATTERNS = [
        re.compile(r"PersistentVolumeClaim.*Pending", re.IGNORECASE),
        re.compile(r"no persistent volumes available", re.IGNORECASE),
        re.compile(r"storageclass.*not found", re.IGNORECASE),
    ]

    DNS_PATTERNS = [
        re.compile(r"dns.*resolution.*fail", re.IGNORECASE),
        re.compile(r"could not resolve", re.IGNORECASE),
        re.compile(r"coredns.*crash", re.IGNORECASE),
        re.compile(r"nxdomain", re.IGNORECASE),
    ]

    RBAC_PATTERNS = [
        re.compile(r"forbidden.*rbac", re.IGNORECASE),
        re.compile(r"cannot.*(?:get|list|create|delete|update).*(?:pods|deployments|services)", re.IGNORECASE),
        re.compile(r"Unauthorized", re.IGNORECASE),
    ]

    def extract(self, file_index: Dict[str, List[str]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Extract all structured signals from indexed bundle files.

        Args:
            file_index: Dict mapping file types to file paths

        Returns:
            Dict of signal categories to lists of signal objects
        """
        signals = {
            "failed_pods": [],
            "oom_kills": [],
            "crashloop_backoffs": [],
            "image_pull_errors": [],
            "pending_pvcs": [],
            "node_conditions": [],
            "recent_events": [],
            "resource_pressure": [],
            "dns_issues": [],
            "rbac_issues": [],
        }

        # Scan log files
        for log_file in file_index.get("logs", []):
            self._scan_log_file(log_file, signals)

        # Scan manifests for pod status
        for manifest_file in file_index.get("manifests", []):
            self._scan_manifest(manifest_file, signals)

        # Scan JSON status files
        for status_file in file_index.get("status", []):
            self._scan_status_file(status_file, signals)

        return signals

    def _scan_log_file(self, file_path: str, signals: Dict):
        """Scan a log file for known signal patterns."""
        try:
            with open(file_path, "r", errors="replace") as f:
                for line_num, line in enumerate(f, 1):
                    if line_num > 5000:  # Limit scan depth
                        break

                    rel_path = os.path.basename(file_path)

                    for pattern in self.OOMKILL_PATTERNS:
                        if pattern.search(line):
                            signals["oom_kills"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.CRASHLOOP_PATTERNS:
                        if pattern.search(line):
                            signals["crashloop_backoffs"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.IMAGE_PULL_PATTERNS:
                        if pattern.search(line):
                            signals["image_pull_errors"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.NODE_PRESSURE_PATTERNS:
                        if pattern.search(line):
                            signals["node_conditions"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.PVC_PATTERNS:
                        if pattern.search(line):
                            signals["pending_pvcs"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.DNS_PATTERNS:
                        if pattern.search(line):
                            signals["dns_issues"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

                    for pattern in self.RBAC_PATTERNS:
                        if pattern.search(line):
                            signals["rbac_issues"].append({
                                "source": rel_path,
                                "line": line_num,
                                "content": line.strip()[:500],
                                "type": "log_line"
                            })
                            break

        except Exception:
            pass

    def _scan_manifest(self, file_path: str, signals: Dict):
        """Scan YAML manifests for pod/resource status."""
        try:
            with open(file_path, "r", errors="replace") as f:
                content = f.read()

            # Look for failed pod indicators in YAML
            if "status:" in content:
                for pattern in self.CRASHLOOP_PATTERNS:
                    if pattern.search(content):
                        signals["failed_pods"].append({
                            "source": os.path.basename(file_path),
                            "content": "Pod in CrashLoopBackOff state",
                            "type": "manifest"
                        })

                for pattern in self.IMAGE_PULL_PATTERNS:
                    if pattern.search(content):
                        signals["failed_pods"].append({
                            "source": os.path.basename(file_path),
                            "content": "Pod with image pull error",
                            "type": "manifest"
                        })

        except Exception:
            pass

    def _scan_status_file(self, file_path: str, signals: Dict):
        """Scan JSON status files for structured data."""
        try:
            with open(file_path, "r") as f:
                data = json.load(f)

            # Look for K8s event objects
            if isinstance(data, dict):
                items = data.get("items", [data])
                for item in items if isinstance(items, list) else [items]:
                    if isinstance(item, dict):
                        kind = item.get("kind", "")
                        if kind == "Event":
                            event_type = item.get("type", "Normal")
                            if event_type == "Warning":
                                signals["recent_events"].append({
                                    "source": os.path.basename(file_path),
                                    "content": item.get("message", ""),
                                    "reason": item.get("reason", ""),
                                    "type": "k8s_event"
                                })

        except (json.JSONDecodeError, Exception):
            pass
