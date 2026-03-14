"""Seed the database with sample data for development."""
import os
import sys
import tarfile
import tempfile
import json
from datetime import datetime, timedelta

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("TESTING", "false")

from app.database import engine, Base, SessionLocal
from app.models import Bundle, Finding, AnalysisEvent, generate_uuid
from app.config import settings


def create_sample_bundle():
    """Create a sample .tar.gz bundle with K8s-like content."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    bundle_id = generate_uuid()
    bundle_path = os.path.join(settings.UPLOAD_DIR, f"{bundle_id}_sample-bundle.tar.gz")

    # Create a temp directory with sample K8s files
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create sample log files
        logs_dir = os.path.join(tmpdir, "logs")
        os.makedirs(logs_dir)

        with open(os.path.join(logs_dir, "api-server.log"), "w") as f:
            f.write("2024-01-15T10:00:00Z INFO Starting API server\n")
            f.write("2024-01-15T10:01:00Z WARN High memory usage detected\n")
            f.write("2024-01-15T10:02:00Z ERROR OOMKilled: container api-server exceeded memory limit\n")
            f.write("2024-01-15T10:02:01Z ERROR Back-off restarting failed container\n")
            f.write("2024-01-15T10:02:02Z WARN CrashLoopBackOff for container api-server\n")

        with open(os.path.join(logs_dir, "node-events.log"), "w") as f:
            f.write("2024-01-15T09:55:00Z WARN MemoryPressure on node worker-1\n")
            f.write("2024-01-15T09:56:00Z WARN DiskPressure on node worker-2\n")

        # Create sample manifests
        manifests_dir = os.path.join(tmpdir, "manifests")
        os.makedirs(manifests_dir)

        with open(os.path.join(manifests_dir, "pods.yaml"), "w") as f:
            f.write("apiVersion: v1\nkind: Pod\nmetadata:\n  name: api-server\nstatus:\n  phase: Failed\n  reason: CrashLoopBackOff\n")

        # Create sample status files
        status_dir = os.path.join(tmpdir, "status")
        os.makedirs(status_dir)

        with open(os.path.join(status_dir, "events.json"), "w") as f:
            json.dump({
                "kind": "EventList",
                "items": [
                    {
                        "kind": "Event",
                        "type": "Warning",
                        "reason": "OOMKilling",
                        "message": "Memory cgroup out of memory: Kill process api-server"
                    },
                    {
                        "kind": "Event",
                        "type": "Warning",
                        "reason": "FailedScheduling",
                        "message": "no persistent volumes available for this claim"
                    }
                ]
            }, f)

        # Create tar.gz
        with tarfile.open(bundle_path, "w:gz") as tar:
            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    full_path = os.path.join(root, file)
                    arcname = os.path.relpath(full_path, tmpdir)
                    tar.add(full_path, arcname=arcname)

    return bundle_id, bundle_path


def seed():
    """Seed the database."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Create sample bundle
        bundle_id, bundle_path = create_sample_bundle()

        bundle = Bundle(
            id=bundle_id,
            filename="sample-bundle.tar.gz",
            file_size=os.path.getsize(bundle_path),
            file_path=bundle_path,
            status="completed",
            upload_time=datetime.utcnow() - timedelta(hours=1),
            analysis_start=datetime.utcnow() - timedelta(minutes=59),
            analysis_end=datetime.utcnow() - timedelta(minutes=58),
        )
        db.add(bundle)

        # Add sample findings
        findings_data = [
            {
                "severity": "critical",
                "category": "resource",
                "title": "OOMKill Detected - Container Memory Limit Exceeded",
                "summary": "Container api-server was killed by OOM killer. Memory limit of 256Mi exceeded.",
                "root_cause": "Container memory limit set to 256Mi but actual usage peaks at 512Mi under load.",
                "impact": "Service unavailability during restart. Cascading failures to dependent services.",
                "confidence": 0.95,
                "source": "pattern_match",
                "recommended_actions": [
                    "Increase memory limit to at least 512Mi",
                    "Profile application memory usage",
                    "Check for memory leaks"
                ],
                "evidence": [
                    {"type": "log_line", "source": "api-server.log", "content": "OOMKilled: container api-server exceeded memory limit", "line": 3}
                ]
            },
            {
                "severity": "critical",
                "category": "resource",
                "title": "Memory-Induced Crash Loop - OOMKill Causing CrashLoopBackOff",
                "summary": "Container api-server is in CrashLoopBackOff due to repeated OOM kills.",
                "root_cause": "Memory limit too low causing repeated OOM kills and crash loops.",
                "impact": "Service completely unavailable with no chance of recovery without intervention.",
                "confidence": 0.97,
                "source": "correlation",
                "recommended_actions": [
                    "URGENT: Increase memory limits immediately",
                    "Check recent deployment for memory requirement changes"
                ],
                "evidence": [
                    {"type": "log_line", "source": "api-server.log", "content": "CrashLoopBackOff for container api-server", "line": 5}
                ]
            },
            {
                "severity": "critical",
                "category": "node",
                "title": "Node Health Issues - Memory and Disk Pressure",
                "summary": "Multiple nodes experiencing resource pressure conditions.",
                "root_cause": "Node-level resource exhaustion affecting workload scheduling.",
                "impact": "Pod evictions and scheduling failures across the cluster.",
                "confidence": 0.85,
                "source": "pattern_match",
                "recommended_actions": [
                    "Add more nodes to the cluster",
                    "Clean up unused resources on affected nodes",
                    "Review pod resource requests"
                ],
                "evidence": [
                    {"type": "log_line", "source": "node-events.log", "content": "MemoryPressure on node worker-1", "line": 1}
                ]
            },
            {
                "severity": "high",
                "category": "storage",
                "title": "PersistentVolumeClaim Scheduling Failure",
                "summary": "PVC cannot be bound - no persistent volumes available.",
                "root_cause": "No matching PersistentVolume or StorageClass provisioner available.",
                "impact": "Pods requiring persistent storage cannot start.",
                "confidence": 0.88,
                "source": "pattern_match",
                "recommended_actions": [
                    "Verify StorageClass exists and provisioner is running",
                    "Check PV capacity matches PVC request"
                ],
                "evidence": [
                    {"type": "k8s_event", "source": "events.json", "content": "no persistent volumes available for this claim"}
                ]
            },
            {
                "severity": "medium",
                "category": "application",
                "title": "Bundle Analysis Summary - Multiple Signals Detected",
                "summary": "Analysis detected multiple correlated signals indicating cluster health issues.",
                "root_cause": "Multiple issues detected across resources, nodes, and storage.",
                "impact": "Cluster stability affected. Review individual findings for details.",
                "confidence": 0.60,
                "source": "llm_analysis",
                "recommended_actions": [
                    "Address critical findings first",
                    "Review resource limits across all deployments",
                    "Set up monitoring alerts"
                ],
                "evidence": []
            }
        ]

        for f_data in findings_data:
            finding = Finding(
                id=generate_uuid(),
                bundle_id=bundle_id,
                **f_data
            )
            db.add(finding)

        db.commit()
        print(f"Seeded database with bundle {bundle_id} and {len(findings_data)} findings")
        print(f"Sample bundle file: {bundle_path}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
