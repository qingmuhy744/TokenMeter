import os


class Settings:
    DB_PATH: str = os.getenv("DB_PATH", "token_speed.db")
    ADMIN_USER: str = os.getenv("ADMIN_USER", "admin")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")
    DEFAULT_PROMPT: str = "Please write a 500-word article about artificial intelligence."
    TIMEOUT_SECONDS: int = 30

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.DB_PATH}"


settings = Settings()
