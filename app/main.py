from fastapi import FastAPI

from app.game.ws import router as game_router
from app.routers.rankings import router as rankings_router

app = FastAPI(title="421")

app.include_router(game_router)
app.include_router(rankings_router)
