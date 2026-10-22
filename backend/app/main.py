from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.redis_client import init_redis, close_redis
from app.utils.logging import setup_logging, logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("starting_up")

    # Initialize content directories
    base = Path(settings.CONTENT_STORAGE_PATH).resolve()
    base.mkdir(parents=True, exist_ok=True)
    for folder in settings.FIXED_ROOT_FOLDERS:
        (base / folder).mkdir(exist_ok=True)
    (base / ".staging").mkdir(exist_ok=True)
    logger.info("content_directories_initialized", path=str(base))

    # Connect Redis
    await init_redis()
    logger.info("redis_connected")

    yield

    # Shutdown
    await close_redis()
    await engine.dispose()
    logger.info("shutdown_complete")


app = FastAPI(
    title="Manzil AI Assessment Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


# Import and include routers
from app.routers import auth, admin, org, quiz, voice, job, student, ingest  # noqa: E402

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(org.router, prefix="/org", tags=["Organization"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])
app.include_router(voice.router, prefix="/voice", tags=["Voice"])
app.include_router(job.router, prefix="/job", tags=["Job Evaluation"])
app.include_router(student.router, prefix="/student", tags=["Student"])
app.include_router(ingest.router, prefix="/ingest", tags=["Ingestion"])
