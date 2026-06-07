"""Application configuration via pydantic-settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    secret_key: str = "change_me"

    database_url: str = "postgresql+asyncpg://amr:amrpassword@localhost:5432/amr_db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # TODO: swap data_provider to "finnhub" and populate key for production
    data_provider: str = "yfinance"
    finnhub_api_key: str = ""

    allowed_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
