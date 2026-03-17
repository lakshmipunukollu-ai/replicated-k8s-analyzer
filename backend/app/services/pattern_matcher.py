"""
PatternMatcher - Matches extracted signals against known K8s failure patterns.
Zero LLM cost for known patterns.
"""
import uuid
from typing import Dict, List, Any


class PatternMatcher:
    """Match signals against known K8s failure pattern library."""

    def match(self, signals: Dict[str, List[Dict[str, Any]]]) -> List[Dict]:
        """
        Match signals against known patterns and produce findings.

        Returns:
            List of finding dicts
        """
        findings = []

        # Pattern 1: OOMKill (oomkill from SignalExtractor)
        oom_evidence = signals.get("oomkill") or signals.get("oom_kills") or []
        if oom_evidence:
            findings.append(self._create_finding(
                severity="critical",
                category="resource",
                title="OOMKill Detected - Container Memory Limit Exceeded",
                summary="One or more containers were killed by the OOM killer due to exceeding their memory limits. "
                        "This indicates the application requires more memory than allocated.",
                root_cause="Container memory limit is set too low for the application's actual memory usage. "
                           "The kernel OOM killer terminates the process when cgroup memory limit is reached.",
                impact="Service unavailability during container restart. Potential data loss if the application "
                       "was processing requests. May trigger CrashLoopBackOff if recurring.",
                evidence=oom_evidence[:5],
                recommended_actions=[
                    "Increase container memory limits based on actual usage patterns",
                    "Profile application memory usage to identify leaks",
                    "Set memory requests equal to limits to prevent overcommit",
                    "Consider implementing graceful shutdown with SIGTERM handling",
                    "Check if horizontal scaling would be more appropriate than vertical"
                ],
                confidence=0.95
            ))

        # Pattern 2: CrashLoopBackOff (crashloop from SignalExtractor)
        crash_evidence = signals.get("crashloop") or signals.get("crashloop_backoffs") or []
        if crash_evidence:
            findings.append(self._create_finding(
                severity="high",
                category="application",
                title="CrashLoopBackOff - Container Repeatedly Crashing",
                summary="Containers are in CrashLoopBackOff state, indicating they crash immediately after starting. "
                        "Kubernetes is backing off restarts with exponential delay.",
                root_cause="Application fails to start or crashes shortly after startup. Common causes include "
                           "missing configuration, failed health checks, or application bugs.",
                impact="Service is unavailable. Pod will continue restart attempts with increasing backoff delays "
                       "(up to 5 minutes between attempts).",
                evidence=crash_evidence[:5],
                recommended_actions=[
                    "Check container logs for startup errors: kubectl logs <pod> --previous",
                    "Verify all required ConfigMaps and Secrets exist",
                    "Check liveness/readiness probe configuration",
                    "Verify the container image and entrypoint are correct",
                    "Check if the application needs database migrations before starting"
                ],
                confidence=0.90
            ))

        # Pattern 3: ImagePullBackOff (imagepull from SignalExtractor)
        image_evidence = signals.get("imagepull") or signals.get("image_pull_errors") or []
        if image_evidence:
            findings.append(self._create_finding(
                severity="high",
                category="config",
                title="Image Pull Failure - Cannot Download Container Image",
                summary="Kubernetes cannot pull one or more container images. Pods will remain in Pending state "
                        "until the image becomes available.",
                root_cause="Image pull failures are typically caused by incorrect image names/tags, "
                           "missing registry credentials, or network connectivity to the registry.",
                impact="Affected pods cannot start. New deployments and rollbacks will fail if they reference "
                       "the unavailable image.",
                evidence=image_evidence[:5],
                recommended_actions=[
                    "Verify the image name and tag exist in the registry",
                    "Check imagePullSecrets are configured correctly",
                    "Verify network connectivity to the container registry",
                    "Check if the registry requires authentication",
                    "Try pulling the image manually on the node: crictl pull <image>"
                ],
                confidence=0.92
            ))

        # Pattern 4: PVC Pending (pvc from SignalExtractor)
        pvc_evidence = signals.get("pvc") or signals.get("pending_pvcs") or []
        if pvc_evidence:
            findings.append(self._create_finding(
                severity="high",
                category="storage",
                title="PersistentVolumeClaim Stuck in Pending State",
                summary="One or more PVCs are stuck in Pending state, preventing pods that depend on them from starting.",
                root_cause="PVC cannot be bound to a PersistentVolume. Common causes: no matching PV available, "
                           "StorageClass not configured, or storage provisioner is not running.",
                impact="Pods requiring persistent storage cannot start. Data-dependent services are unavailable.",
                evidence=pvc_evidence[:5],
                recommended_actions=[
                    "Check if the required StorageClass exists: kubectl get sc",
                    "Verify the storage provisioner is running",
                    "Check if PV capacity matches PVC request",
                    "Verify access modes (RWO/RWX/ROX) are supported",
                    "Check cloud provider storage quotas and limits"
                ],
                confidence=0.88
            ))

        # Pattern 5: Node Conditions (memorypressure, diskpressure, notready, node_statuses from SignalExtractor)
        node_evidence = (
            (signals.get("memorypressure") or []) +
            (signals.get("diskpressure") or []) +
            (signals.get("notready") or []) +
            (signals.get("node_conditions") or [])
        )
        if node_evidence:
            findings.append(self._create_finding(
                severity="critical",
                category="node",
                title="Node Health Issues Detected",
                summary="One or more cluster nodes are experiencing health issues including disk pressure, "
                        "memory pressure, or NotReady conditions.",
                root_cause="Node-level resource exhaustion or infrastructure problems. Disk pressure indicates "
                           "the node filesystem is running out of space. Memory pressure indicates the node is "
                           "running low on available memory.",
                impact="Pods may be evicted from unhealthy nodes. New pod scheduling may fail. Existing workloads "
                       "may experience degraded performance or termination.",
                evidence=node_evidence[:5],
                recommended_actions=[
                    "Check node disk usage: kubectl describe node <node> | grep -A5 Conditions",
                    "Clear unused images and containers on affected nodes",
                    "Check for pods consuming excessive resources",
                    "Consider adding more nodes to the cluster",
                    "Review pod resource requests and limits for right-sizing"
                ],
                confidence=0.85
            ))

        # Pattern 6: DNS Issues (dns from SignalExtractor)
        dns_evidence = signals.get("dns") or signals.get("dns_issues") or []
        if dns_evidence:
            findings.append(self._create_finding(
                severity="high",
                category="network",
                title="DNS Resolution Failures Detected",
                summary="Service discovery is failing due to DNS resolution issues. This affects inter-service "
                        "communication within the cluster.",
                root_cause="DNS resolution failures can be caused by CoreDNS pod issues, network policy "
                           "blocking DNS traffic, or misconfigured DNS settings.",
                impact="Services cannot discover each other. API calls between microservices will fail. "
                       "External service resolution may also be affected.",
                evidence=dns_evidence[:5],
                recommended_actions=[
                    "Check CoreDNS pods are running: kubectl get pods -n kube-system -l k8s-app=kube-dns",
                    "Review CoreDNS logs for errors",
                    "Verify NetworkPolicies allow DNS traffic (port 53 UDP/TCP)",
                    "Test DNS from within a pod: nslookup kubernetes.default",
                    "Check /etc/resolv.conf in affected pods"
                ],
                confidence=0.85
            ))

        # Pattern 7: RBAC Issues (no equivalent in new extractor; keep for backward compat)
        rbac_evidence = signals.get("rbac_issues") or []
        if rbac_evidence:
            findings.append(self._create_finding(
                severity="medium",
                category="config",
                title="RBAC Permission Errors Detected",
                summary="Kubernetes RBAC authorization failures detected. Services or operators lack required "
                        "permissions to perform their operations.",
                root_cause="ClusterRole/Role bindings are missing or insufficient for the service account "
                           "being used by the affected workloads.",
                impact="Affected services cannot access required Kubernetes resources. Operators may fail "
                       "to manage their target resources.",
                evidence=rbac_evidence[:5],
                recommended_actions=[
                    "Review service account permissions for affected pods",
                    "Check ClusterRoleBindings and RoleBindings",
                    "Verify the correct service account is assigned to the pod",
                    "Use 'kubectl auth can-i' to test permissions",
                    "Consider using least-privilege RBAC policies"
                ],
                confidence=0.80
            ))

        # Cross-signal correlations
        # OOMKill + CrashLoopBackOff = memory-caused crash loop
        if oom_evidence and crash_evidence:
            findings.append(self._create_finding(
                severity="critical",
                category="resource",
                title="Memory-Induced Crash Loop - OOMKill Causing CrashLoopBackOff",
                summary="Containers are being OOM-killed and entering CrashLoopBackOff. The crash loop is a "
                        "direct result of memory exhaustion, not an application bug.",
                root_cause="Container memory limit is too low, causing repeated OOM kills. Each restart attempts "
                           "to use the same amount of memory, hitting the limit again.",
                impact="Service is completely unavailable with no chance of recovery without intervention. "
                       "The exponential backoff means recovery time increases with each restart.",
                evidence=(oom_evidence[:3] + crash_evidence[:3]),
                recommended_actions=[
                    "URGENT: Increase memory limits immediately",
                    "Check if a recent deployment changed memory requirements",
                    "Profile application memory usage in a staging environment",
                    "Consider if a memory leak was introduced in a recent release",
                    "Set up memory monitoring alerts to catch this earlier"
                ],
                confidence=0.97,
                source="correlation"
            ))

        # Node pressure + failed pods = eviction cascade (failed_pods -> pod_statuses with non-Running)
        failed_pods = signals.get("failed_pods") or signals.get("pod_statuses") or []
        if node_evidence and failed_pods:
            findings.append(self._create_finding(
                severity="critical",
                category="node",
                title="Node Pressure Causing Pod Evictions",
                summary="Node health issues are correlated with pod failures, suggesting pods are being "
                        "evicted due to node-level resource pressure.",
                root_cause="When nodes experience disk or memory pressure, Kubernetes evicts pods to free "
                           "resources. Lower-priority pods are evicted first.",
                impact="Multiple services may be affected simultaneously. Evicted pods may not reschedule "
                       "if all nodes are under pressure.",
                evidence=(node_evidence[:3] + failed_pods[:3]),
                recommended_actions=[
                    "Identify the source of resource consumption on affected nodes",
                    "Scale the cluster to add more nodes",
                    "Set appropriate PriorityClasses for critical workloads",
                    "Implement pod disruption budgets for important services",
                    "Review resource requests to prevent overcommit"
                ],
                confidence=0.88,
                source="correlation"
            ))

        return findings

    def _create_finding(
        self,
        severity: str,
        category: str,
        title: str,
        summary: str,
        root_cause: str,
        impact: str,
        evidence: List[Dict],
        recommended_actions: List[str],
        confidence: float = 0.85,
        source: str = "pattern_match"
    ) -> Dict:
        return {
            "id": str(uuid.uuid4()),
            "severity": severity,
            "category": category,
            "title": title,
            "summary": summary,
            "root_cause": root_cause,
            "impact": impact,
            "evidence": evidence,
            "recommended_actions": recommended_actions,
            "related_findings": [],
            "confidence": confidence,
            "source": source
        }
