from fastapi import FastAPI

from app.game.ws import router as game_router

app = FastAPI(title="421")

app.include_router(game_router)
