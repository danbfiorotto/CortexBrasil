from pydantic_settings import BaseSettings
from typing import Optional
from pydantic import model_validator

class Settings(BaseSettings):
    APP_ENV: str = "development"
    SECRET_KEY: str = "supersecretkey"
    
    # Database
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "mentor_invisivel"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    DATABASE_URL: Optional[str] = None

    # WhatsApp
    WHATSAPP_API_TOKEN: Optional[str] = None
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    WHATSAPP_VERIFY_TOKEN: str = "my_verify_token"
    WHATSAPP_API_SECRET: Optional[str] = None
    
    # Cloudflare
    CLOUDFLARE_TUNNEL_TOKEN: Optional[str] = None

    # VLLM
    HUGGING_FACE_HUB_TOKEN: Optional[str] = None

    @model_validator(mode='after')
    def assemble_db_connection(self):
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        return self

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()
