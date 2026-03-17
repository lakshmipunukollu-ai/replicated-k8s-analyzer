"""
SignalExtractor - Extracts failure signals from indexed bundle files.
Handles both generic bundles and Replicated Troubleshoot bundle format.
"""
import json
import os
import re
from typing import Dict, List, Any


class SignalExtractor:
    """Extracts structured signals from K8s support bundle files."""

    CRITICAL_PATTERNS = [
        (r'OOMKill|OOM.?Kill|oom.?kill|exceeded memory limit|container.*OOM', 'oomkill'),
        (r'CrashLoopBackOff|CrashLoop|crash.loop', 'crashloop'),
        (r'ImagePullBackOff|ErrImagePull|Failed to pull image|image.*not found', 'imagepull'),
        (r'MemoryPressure|memory.pressure|kubelet has memory pressure', 'memorypressure'),
        (r'DiskPressure|disk.pressure|no space left', 'diskpressure'),
        (r'etcd.*unavailable|failed to send.*heartbeat|lost leader election', 'etcd'),
        (r'SERVFAIL|coredns.*fail|dns.*fail|failed to list.*Service', 'dns'),
        (r'PVC.*cannot be bound|no persistent volumes|ProvisioningFailed|unbound.*PersistentVolumeClaim', 'pvc'),
        (r'BackOff|back.off restarting|restart.*failed', 'backoff'),
        (r'Evicted|evict|node.*low on resource', 'eviction'),
        (r'NotReady|not.ready|node.*NotReady', 'notready'),
        (r'Pending.*unbound|0/[0-9]+ nodes available', 'scheduling'),
    ]

    def extract(self, bundle_data: Dict) -> Dict[str, Any]:
        """Extract signals from all bundle files."""
        signals = {
            "oomkill": [],
            "crashloop": [],
            "imagepull": [],
            "memorypressure": [],
            "diskpressure": [],
            "etcd": [],
            "dns": [],
            "pvc": [],
            "backoff": [],
            "eviction": [],
            "notready": [],
            "scheduling": [],
            "pod_statuses": [],
            "node_statuses": [],
            "events": [],
            "raw_signals": [],
        }

        # Process log files
        for log_path in bundle_data["files"]["logs"][:20]:
            self._extract_from_log(log_path, signals, bundle_data.get("extractor"))

        # Process event files
        for event_path in bundle_data["files"].get("events", [])[:5]:
            self._extract_from_events(event_path, signals, bundle_data.get("extractor"))

        # Process status/JSON files
        for status_path in bundle_data["files"]["status"][:20]:
            self._extract_from_status(status_path, signals, bundle_data.get("extractor"))

        return signals

    def _extract_from_log(self, path: str, signals: Dict, extractor=None):
        try:
            with open(path, 'r', errors='replace') as f:
                content = f.read(50000)

            path_norm = path.replace(os.sep, '/')

            for pattern, signal_type in self.CRITICAL_PATTERNS:
                matches = re.findall(pattern, content, re.IGNORECASE)
                if matches:
                    # Get context around the match; store actual file path as source
                    lines = content.split('\n')
                    for i, line in enumerate(lines):
                        if re.search(pattern, line, re.IGNORECASE):
                            context = '\n'.join(lines[max(0, i - 1):min(len(lines), i + 2)])
                            signals[signal_type].append({
                                "source": path_norm,
                                "line": line.strip()[:200],
                                "context": context[:300],
                            })
                            if signal_type not in [s.get("type") for s in signals["raw_signals"]]:
                                signals["raw_signals"].append({
                                    "type": signal_type,
                                    "source": path_norm,
                                    "evidence": line.strip()[:200],
                                })
                            break

        except Exception:
            pass

    def _extract_from_events(self, path: str, signals: Dict, extractor=None):
        try:
            with open(path, 'r', errors='replace') as f:
                data = json.load(f)

            path_norm = path.replace(os.sep, '/')
            items = data.get('items', []) if isinstance(data, dict) else []
            for event in items[:100]:
                reason = event.get('reason', '')
                message = event.get('message', '')
                event_type = event.get('type', '')
                involved = event.get('involvedObject', {})

                text = f"{reason} {message}"

                for pattern, signal_type in self.CRITICAL_PATTERNS:
                    if re.search(pattern, text, re.IGNORECASE):
                        signals[signal_type].append({
                            "source": path_norm,
                            "reason": reason,
                            "message": message[:200],
                            "object": f"{involved.get('kind', '')}/{involved.get('name', '')}",
                        })
                        signals["events"].append({
                            "reason": reason,
                            "message": message[:200],
                            "type": event_type,
                            "object": f"{involved.get('kind', '')}/{involved.get('name', '')}",
                        })
                        break

        except Exception:
            pass

    def _extract_from_status(self, path: str, signals: Dict, extractor=None):
        try:
            with open(path, 'r', errors='replace') as f:
                data = json.load(f)

            path_norm = path.replace(os.sep, '/')

            # Handle pod status JSON (Troubleshoot format)
            if isinstance(data, dict):
                items = data.get('items', [])
                kind = data.get('kind', '')
                path_lower = path_norm.lower()

                for item in items[:50]:
                    metadata = item.get('metadata', {})
                    name = metadata.get('name', 'unknown')
                    namespace = metadata.get('namespace', 'default')
                    item_kind = item.get('kind', kind)

                    # Pod status
                    if item_kind == 'Pod' or 'pods' in path_lower:
                        status = item.get('status', {})
                        phase = status.get('phase', '')
                        container_statuses = status.get('containerStatuses', [])

                        for cs in container_statuses:
                            state = cs.get('state', {})
                            restart_count = cs.get('restartCount', 0)

                            waiting = state.get('waiting', {})
                            terminated = state.get('terminated', {})

                            reason = waiting.get('reason', '') or terminated.get('reason', '')

                            pod_info = {
                                "source": path_norm,
                                "name": name,
                                "namespace": namespace,
                                "container": cs.get('name', ''),
                                "reason": reason,
                                "restarts": restart_count,
                                "phase": phase,
                            }

                            if reason in ('OOMKilled',):
                                signals["oomkill"].append(pod_info)
                                signals["pod_statuses"].append({**pod_info, "status": "OOMKilled"})
                            elif reason in ('CrashLoopBackOff',):
                                signals["crashloop"].append(pod_info)
                                signals["pod_statuses"].append({**pod_info, "status": "CrashLoopBackOff"})
                            elif reason in ('ImagePullBackOff', 'ErrImagePull'):
                                signals["imagepull"].append(pod_info)
                                signals["pod_statuses"].append({**pod_info, "status": reason})
                            elif restart_count > 3:
                                signals["backoff"].append(pod_info)
                                signals["pod_statuses"].append({**pod_info, "status": "HighRestarts"})

                    # Node status
                    elif item_kind == 'Node' or 'nodes' in path_lower:
                        status = item.get('status', {})
                        conditions = status.get('conditions', [])
                        for cond in conditions:
                            cond_type = cond.get('type', '')
                            cond_status = cond.get('status', '')
                            message = cond.get('message', '')
                            if cond_type == 'MemoryPressure' and cond_status == 'True':
                                signals["memorypressure"].append({"source": path_norm, "node": name, "message": message})
                            elif cond_type == 'DiskPressure' and cond_status == 'True':
                                signals["diskpressure"].append({"source": path_norm, "node": name, "message": message})
                            elif cond_type == 'Ready' and cond_status == 'False':
                                signals["notready"].append({"source": path_norm, "node": name, "message": message})
                                signals["node_statuses"].append({"source": path_norm, "node": name, "condition": "NotReady"})

                    # PVC status
                    elif item_kind == 'PersistentVolumeClaim' or 'pvcs' in path_lower:
                        pvc_status = item.get('status', {})
                        phase = pvc_status.get('phase', '')
                        if phase == 'Pending':
                            signals["pvc"].append({
                                "source": path_norm,
                                "name": name,
                                "namespace": namespace,
                                "phase": phase,
                            })

        except Exception:
            pass
