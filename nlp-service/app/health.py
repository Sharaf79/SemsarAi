from fastapi import APIRouter

from .schemas import HealthResponse

router = APIRouter()


def make_router(classifier_name: str, model_loaded: bool) -> APIRouter:
    r = APIRouter()

    @r.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok" if model_loaded or classifier_name == "stub" else "degraded",
            modelLoaded=model_loaded,
            classifier=classifier_name,  # type: ignore[arg-type]
        )

    return r
