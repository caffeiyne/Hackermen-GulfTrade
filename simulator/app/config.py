"""
Application configuration — loads from environment variables / .env file.
"""

import os
from pydantic_settings import BaseSettings


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
