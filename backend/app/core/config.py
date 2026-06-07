"""Application configuration via pydantic-settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    secret_key: str = "change_me"

    # Default to a zero-config local SQLite DB so the app runs with NO external
    # infrastructure (no Postgres / Redis / Celery required for personal use).
    # Override with a Postgres URL in production via the DATABASE_URL env var.
    database_url: str = "sqlite+aiosqlite:///./amr_personal.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # TODO: swap data_provider to "finnhub" and populate key for production
    data_provider: str = "yfinance"
    finnhub_api_key: str = ""

    # In-memory OHLCV cache TTL (seconds). Avoids re-hitting yfinance on every call.
    cache_ttl_seconds: int = 900  # 15 minutes

    allowed_origins: list[str] = [
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:8000",
        "http://localhost:3000",
        "*",
    ]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
