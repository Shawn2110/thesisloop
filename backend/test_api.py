import os

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient

from backend.main import app


HEADERS = {"X-Workspace-Id": "test-workspace-one"}


def test_decision_loop_keeps_original_thesis() -> None:
    with TestClient(app) as client:
        initial = client.get("/api/setups", headers=HEADERS)
        assert initial.status_code == 200
        assert len(initial.json()["setups"]) == 8

        original = "The original thesis must remain unchanged."
        created = client.post(
            "/api/setups",
            headers=HEADERS,
            json={
                "symbol": "demo",
                "setup": "API test",
                "source": "Test suite",
                "thesis": original,
                "plannedRisk": 1.2,
                "createdAt": "2026-09-09",
                "status": "open",
            },
        )
        assert created.status_code == 201
        setup = created.json()["setups"][0]
        assert setup["symbol"] == "DEMO"

        closed = client.patch(
            f"/api/setups/{setup['id']}/outcome",
            headers=HEADERS,
            json={"returnPct": 2.4, "followedPlan": True, "outcomeNote": "The plan was followed."},
        )
        assert closed.status_code == 200
        assert closed.json()["thesis"] == original
        assert closed.json()["status"] == "closed"

        repeated = client.patch(
            f"/api/setups/{setup['id']}/outcome",
            headers=HEADERS,
            json={"returnPct": 3.0, "followedPlan": False, "outcomeNote": "Overwrite attempt."},
        )
        assert repeated.status_code == 409


def test_invalid_setup_is_rejected() -> None:
    with TestClient(app) as client:
        response = client.post("/api/setups", json={}, headers=HEADERS)
        assert response.status_code == 422


def test_health_reports_database() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "sqlite"}


def test_workspaces_are_isolated() -> None:
    with TestClient(app) as client:
        first = client.get("/api/setups", headers={"X-Workspace-Id": "workspace-alpha"})
        second = client.get("/api/setups", headers={"X-Workspace-Id": "workspace-bravo"})
        assert len(first.json()["setups"]) == 8
        assert len(second.json()["setups"]) == 8
        assert {row["id"] for row in first.json()["setups"]}.isdisjoint({row["id"] for row in second.json()["setups"]})
