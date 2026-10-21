from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore", case_sensitive=False)
    port: int = 4002
    grpc_port: int = 50052
    mongodb_uri: str = "mongodb://localhost:27017/?replicaSet=rs0"
    mongodb_db: str = "catalog_db"
    auth_jwks_url: str = "http://localhost:4001/.well-known/jwks.json"
    jwt_issuer: str = "ticksy-auth"
    jwt_audience: str = "ticksy-api"
    log_level: str = "INFO"
    environment: str = "development"

settings = Settings()
