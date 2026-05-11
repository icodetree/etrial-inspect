from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    print("Health response:", response.json())
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

if __name__ == "__main__":
    print("Running health check test...")
    test_health()
    print("Test passed successfully!")
