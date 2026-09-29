from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Gesture Control API", version="0.1.0")


class GestureValidation(BaseModel):
    gesture: str = Field(min_length=1, max_length=40)
    confidence: float = Field(ge=0, le=1)
    stable_frames: int = Field(ge=0, le=120)


@app.get("/api")
def root():
    return {
        "name": "gesture-control",
        "status": "ok",
        "realtime_path": "WebRTC data channel",
        "video_uploaded": False,
    }


@app.get("/api/health")
def health():
    return {"ok": True, "service": "gesture-control-api"}


@app.post("/api/validate-gesture")
def validate_gesture(sample: GestureValidation):
    accepted = sample.confidence >= 0.85 and sample.stable_frames >= 3
    return {
        "gesture": sample.gesture,
        "accepted": accepted,
        "policy": {"min_confidence": 0.85, "min_stable_frames": 3},
    }
