from fastapi import FastAPI
from contextlib import asynccontextmanager
from src.api.webhook import router as webhook_router
import logging

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: could initialize connections if needed
    yield
    # Shutdown

app = FastAPI(title="Semsar AI WhatsApp Bot", lifespan=lifespan)

app.include_router(webhook_router)

@app.get("/")
def health_check():
    return {"status": "healthy", "service": "Semsar AI"}
