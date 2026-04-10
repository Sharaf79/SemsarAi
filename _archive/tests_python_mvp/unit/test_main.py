"""Tests for src/main.py — FastAPI app factory + health check."""

import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthCheck:
    def test_returns_200(self, client):
        response = client.get("/")
        assert response.status_code == 200

    def test_returns_healthy_status(self, client):
        response = client.get("/")
        data = response.json()
        assert data["status"] == "healthy"

    def test_returns_service_name(self, client):
        response = client.get("/")
        data = response.json()
        assert data["service"] == "Semsar AI"


class TestAppSetup:
    def test_webhook_router_included(self, client):
        """The /webhook route should be registered (GET for verification)."""
        # Without valid verify_token this will return 403, but the route exists
        response = client.get("/webhook")
        # 403 means the route exists but token is wrong — that's expected
        assert response.status_code in (200, 403)

    def test_unknown_route_returns_404(self, client):
        response = client.get("/nonexistent-route")
        assert response.status_code == 404
