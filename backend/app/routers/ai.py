from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import AIAnswer, AIQuestion
from ..security import require_customer
from ..services import ai

router = APIRouter(prefix="/api/ai", tags=["AI insights"])

SUGGESTIONS = [
    "Summarize my last five orders.",
    "Which of my orders are still not delivered?",
    "How much did I spend this week?",
    "Which food items have I ordered most frequently?",
]


@router.get("/suggestions", response_model=list[str])
def suggestions(_: User = Depends(require_customer)):
    return SUGGESTIONS


@router.post("/insights", response_model=AIAnswer)
async def insights(body: AIQuestion, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    ai.check_rate_limit(user.id)
    return await run_in_threadpool(ai.ask, db, user, body.question.strip())
