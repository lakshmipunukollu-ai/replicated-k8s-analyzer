"""Tests for the health endpoint."""


def test_health_check(client):
    """GET /health returns healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "replicated-k8s-analyzer"
    assert data["version"] == "1.0.0"
