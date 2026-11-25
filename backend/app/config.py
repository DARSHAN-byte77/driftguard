from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "MarineWatch API"
    app_env: str = "development"
    debug: bool = True
    database_url: str = "postgresql+psycopg://postgres@localhost:5432/marinewatch"
    test_database_url: str = "sqlite:///./test_marinewatch.db"
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    copernicus_client_id: str = ""
    copernicus_client_secret: str = ""
    copernicus_token_url: str = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    copernicus_catalog_url: str = "https://catalogue.dataspace.copernicus.eu/odata/v1"
    copernicus_stac_url: str = "https://catalogue.dataspace.copernicus.eu/stac"
    cors_origins: str = "http://localhost:5173"
    satellite_storage: str = "storage/satellite"
    processed_storage: str = "storage/processed"
    max_upload_bytes: int = 2_147_483_648

    model_config = SettingsConfigDict(env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
