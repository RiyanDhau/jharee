import os


class Config:
    # change SECRET_KEY before putting the game anywhere public
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # 0.0.0.0 lets other devices on the same Wi-Fi connect to your laptop
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", 5000))
    DEBUG = os.environ.get("DEBUG", "0") == "1"
