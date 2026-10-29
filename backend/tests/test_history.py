"""Tests for history endpoint."""
from __future__ import annotations


def test_history_endpoint_structure(client):
    resp = client.get("/api/history")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


def test_history_limit_param(client):
    resp = client.get("/api/history?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) <= 5
