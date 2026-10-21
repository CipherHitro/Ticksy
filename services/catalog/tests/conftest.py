import time
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import jwt
from unittest.mock import MagicMock
import httpx
from app.main import app
import app.core.security as security_module

def pytest_configure(config):
    config.addinivalue_line("markers", "test_id(id): mark test with verification spec test ID")

# Generate test RSA key pair
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()
_public_pem = _public_key.public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo
).decode("utf-8")

class MockSigningKey:
    def __init__(self, key):
        self.key = key

class MockJwksClient:
    def get_signing_key_from_jwt(self, token):
        return MockSigningKey(_public_pem)

@pytest.fixture(autouse=True)
def mock_jwks(monkeypatch):
    monkeypatch.setattr(security_module, "_jwks_client", lambda: MockJwksClient())

def mint_token(sub: str, role: str, name: str = "Test User", email: str = "test@example.com", expires_in: int = 900, kid: str = "test-key-1"):
    now = int(time.time())
    payload = {
        "sub": sub,
        "role": role,
        "name": name,
        "email": email,
        "iss": "ticksy-auth",
        "aud": "ticksy-api",
        "iat": now,
        "exp": now + expires_in
    }
    return jwt.encode(payload, _private_key, algorithm="RS256", headers={"kid": kid})

@pytest.fixture
def organizer_token():
    return mint_token(sub="org-user-1", role="ORGANIZER", name="Rockstar Events")

@pytest.fixture
def other_organizer_token():
    return mint_token(sub="org-user-2", role="ORGANIZER", name="Indie Promoter")

@pytest.fixture
def attendee_token():
    return mint_token(sub="att-user-1", role="ATTENDEE", name="John Attendee")

@pytest.fixture
def admin_token():
    return mint_token(sub="admin-user-1", role="ADMIN", name="System Admin")

from pymongo import AsyncMongoClient
from app.core.config import settings
from app.repositories.events import EventRepository
from app.services.events import EventService

@pytest.fixture
async def client():
    mongo_client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    app.state.mongo = mongo_client
    db = mongo_client[settings.mongodb_db]
    repo = EventRepository(db)
    await repo.ensure_indexes()
    app.state.event_repository = repo
    app.state.event_service = EventService(repo)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await mongo_client.close()
