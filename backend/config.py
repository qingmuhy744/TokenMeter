import os
import secrets


class Settings:
    VERSION: str = "0.1.0"
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"
    )
    ADMIN_USER: str = os.getenv("ADMIN_USER", "admin")
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    DEFAULT_PROMPT: str = "介绍下自己是什么模型，谁开发的？"
    DEFAULT_MAX_TOKENS: int = 256
    DEFAULT_TEST_COUNT: int = 3
    TIMEOUT_SECONDS: int = 30

    @property
    def database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
