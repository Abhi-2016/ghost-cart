from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # If an env var exists but is empty, ignore it and fall back to .env
        env_ignore_empty=True,
    )

    env: str = "development"

    # Anthropic — kept server-side only, never forwarded to clients
    anthropic_api_key: str

    # Claude model to use for recommendations
    claude_model: str = "claude-sonnet-4-6"

    # Shared secret that the gateway must include as X-Internal-Secret header
    brain_internal_secret: str = ""

    # Comma-separated list of allowed CORS origins (gateway URL in production)
    # e.g. "https://ghost-cart-gateway.railway.app,http://localhost:3000"
    allowed_origins: str = "http://localhost:3000"

    # In-process LRU cache for AI responses (entries)
    cache_maxsize: int = 512
    # Seconds before a cached AI response expires
    cache_ttl: int = 600

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
