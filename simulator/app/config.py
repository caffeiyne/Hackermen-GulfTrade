"""
Application configuration — loads from environment variables / .env file.
"""

import os
import json
from pydantic_settings import BaseSettings


def _parse_cors_origins() -> list[str]:
    """Parse CORS_ORIGINS from env var. Accepts JSON list or comma-separated string."""
    raw = os.environ.get("CORS_ORIGINS", "")
    if not raw:
        return ["*"]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    # Fallback: treat as comma-separated string
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/tradling"

    # API
    api_title: str = "Tradeling Inventory Intelligence Simulator"
    api_version: str = "1.0.0"
    cors_origins: list[str] = ["*"]

    # Simulator defaults
    default_speed: int = 1          # 1 real second = 1 sim hour at speed=1
    sim_start_date: str = "2024-10-27"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
# Override cors_origins from env if set (handles both JSON list and comma-separated)
if os.environ.get("CORS_ORIGINS"):
    settings.cors_origins = _parse_cors_origins()
