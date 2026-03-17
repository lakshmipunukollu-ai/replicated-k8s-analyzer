from typing import List, Dict, Any

STEP_TEMPLATES = {
    "oomkill": [
        {"step": 1, "label": "Check current memory usage", "type": "diagnostic", "cmd": "kubectl top pods --all-namespaces | sort -k4 -rn | head -20"},
        {"step": 2, "label": "Check resource limits on affected pods", "type": "diagnostic", "cmd": "kubectl describe pod {pod} -n {namespace} | grep -A 5 Limits"},
        {"step": 3, "label": "Increase memory limit", "type": "fix", "cmd": "kubectl set resources deployment {deployment} -c={container} --limits=memory=512Mi --requests=memory=256Mi"},
        {"step": 4, "label": "Restart and verify", "type": "verify", "cmd": "kubectl rollout restart deployment {deployment} && kubectl rollout status deployment {deployment}"},
    ],
    "crashloopbackoff": [
        {"step": 1, "label": "Check recent logs", "type": "diagnostic", "cmd": "kubectl logs {pod} --previous -n {namespace} | tail -50"},
        {"step": 2, "label": "Describe pod for events", "type": "diagnostic", "cmd": "kubectl describe pod {pod} -n {namespace}"},
        {"step": 3, "label": "Force delete and recreate", "type": "fix", "cmd": "kubectl delete pod {pod} -n {namespace} --force --grace-period=0"},
    ],
    "memorypressure": [
        {"step": 1, "label": "Check node memory", "type": "diagnostic", "cmd": "kubectl describe node {node} | grep -A 10 'Allocated resources'"},
        {"step": 2, "label": "Evict non-critical pods", "type": "fix", "cmd": "kubectl drain {node} --ignore-daemonsets --delete-emptydir-data --force"},
        {"step": 3, "label": "Clear unused images", "type": "fix", "cmd": "kubectl debug node/{node} -it --image=busybox -- chroot /host crictl rmi --prune"},
    ],
    "pvc": [
        {"step": 1, "label": "Check PVC status", "type": "diagnostic", "cmd": "kubectl get pvc --all-namespaces | grep -v Bound"},
        {"step": 2, "label": "Check available PVs", "type": "diagnostic", "cmd": "kubectl get pv | grep Available"},
        {"step": 3, "label": "Check StorageClass", "type": "diagnostic", "cmd": "kubectl get storageclass && kubectl get events | grep ProvisioningFailed"},
    ],
    "default": [
        {"step": 1, "label": "Get cluster overview", "type": "diagnostic", "cmd": "kubectl get nodes,pods --all-namespaces | grep -v Running"},
        {"step": 2, "label": "Check recent events", "type": "diagnostic", "cmd": "kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -20"},
    ],
}

TYPE_COLORS = {"diagnostic": "#2563eb", "fix": "#10b981", "verify": "#6366f1"}
TYPE_BG = {"diagnostic": "#eff6ff", "fix": "#f0fdf4", "verify": "#f5f3ff"}
TYPE_TEXT = {"diagnostic": "#1e40af", "fix": "#166534", "verify": "#4c1d95"}


class PlaybookService:
    def generate(self, bundle, findings) -> List[Dict[str, Any]]:
        playbooks = []
        for finding in findings:
            if finding.severity not in ("critical", "high"):
                continue
            steps = self._get_steps(finding)
            playbooks.append({
                "finding_id": finding.id,
                "finding_title": finding.title,
                "severity": finding.severity,
                "steps": steps,
            })
        return playbooks

    def _get_steps(self, finding) -> List[Dict]:
        title_lower = (finding.title or "").lower()
        if "oom" in title_lower:
            template = STEP_TEMPLATES["oomkill"]
        elif "crashloop" in title_lower:
            template = STEP_TEMPLATES["crashloopbackoff"]
        elif "memory pressure" in title_lower or "memorypressure" in title_lower:
            template = STEP_TEMPLATES["memorypressure"]
        elif "pvc" in title_lower or "persistent" in title_lower or "storage" in title_lower:
            template = STEP_TEMPLATES["pvc"]
        else:
            template = STEP_TEMPLATES["default"]

        return [
            {
                "step": s["step"],
                "label": s["label"],
                "type": s["type"],
                "cmd": s["cmd"],
                "color": TYPE_COLORS.get(s["type"], "#94a3b8"),
                "bg": TYPE_BG.get(s["type"], "#f8fafc"),
                "text_color": TYPE_TEXT.get(s["type"], "#374151"),
            }
            for s in template
        ]
