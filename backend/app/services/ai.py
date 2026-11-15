"""AI order insights using the OpenAI API, grounded in the authenticated customer's own orders.

Only the requesting customer's orders are loaded from the database and sent as context, so one customer can
never see another customer's data. Without an OPENAI_API_KEY an offline rule-based summary is returned so the
feature still works for demos.
"""
import json
import logging
import threading
import time
from collections import Counter, defaultdict, deque
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import config
from ..models import Order, OrderStatus, User, utcnow

log = logging.getLogger("campusbite.ai")

# ---------------------------------------------------------------- simple per-user rate limiter
_calls: dict[int, deque] = defaultdict(deque)
_lock = threading.Lock()


def check_rate_limit(user_id: int):
    now = time.monotonic()
    with _lock:
        q = _calls[user_id]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= config.AI_RATE_LIMIT_PER_MINUTE:
            retry = int(60 - (now - q[0])) + 1
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                f"Too many AI requests. Please wait {retry}s and try again.", headers={"Retry-After": str(retry)})
        q.append(now)


# ---------------------------------------------------------------- context building
def load_orders(db: Session, customer: User, limit: int = 50) -> list[Order]:
    return list(db.scalars(
        select(Order).where(Order.customer_id == customer.id)  # <- scoping: only this customer's orders
        .options(selectinload(Order.items), selectinload(Order.restaurant), selectinload(Order.review))
        .order_by(Order.created_at.desc()).limit(limit)
    ).all())


def orders_context(orders: list[Order]) -> list[dict]:
    return [{
        "order_id": o.id,
        "placed_at": o.created_at.strftime("%Y-%m-%d %H:%M UTC"),
        "restaurant": o.restaurant.name if o.restaurant else "",
        "status": o.status.value,
        "total": round(o.total_amount, 2),
        "payment_status": o.payment_status.value,
        "return_status": o.return_status.value,
        "items": [{"name": i.name, "qty": i.quantity, "unit_price": i.unit_price} for i in o.items],
        "my_rating": o.review.rating if o.review else None,
    } for o in orders]


SYSTEM_PROMPT = (
    "You are CampusBite's friendly order assistant. Answer the customer's question using ONLY the order history JSON "
    "provided. Amounts are in Indian Rupees (₹). Today's date (UTC) is {today}. Be concise: a short paragraph or a few "
    "bullet points. If the data doesn't contain the answer, say so. Never invent orders."
)


def ask(db: Session, customer: User, question: str) -> dict:
    orders = load_orders(db, customer)
    if not orders:
        return {"answer": "You haven't placed any orders yet. Browse restaurants and place your first order to get insights!",
                "source": "offline", "orders_considered": 0}
    ctx = orders_context(orders)
    if not config.OPENAI_API_KEY:
        return {"answer": offline_answer(question, orders), "source": "offline", "orders_considered": len(orders)}
    return {"answer": _openai_answer(question, ctx), "source": "openai", "orders_considered": len(orders)}


def _openai_answer(question: str, ctx: list[dict]) -> str:
    import openai

    client = openai.OpenAI(api_key=config.OPENAI_API_KEY, timeout=30, max_retries=2)
    try:
        resp = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            temperature=0.3,
            max_tokens=500,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(today=utcnow().strftime("%Y-%m-%d (%A)"))},
                {"role": "user", "content": f"My order history (newest first):\n{json.dumps(ctx, ensure_ascii=False)}\n\nQuestion: {question}"},
            ],
        )
        return (resp.choices[0].message.content or "").strip() or "Sorry, I couldn't generate an answer."
    except openai.RateLimitError:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "The AI service is busy (rate limit reached). Please try again in a minute.")
    except openai.AuthenticationError:
        log.error("OpenAI authentication failed - check OPENAI_API_KEY")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI service is misconfigured (invalid API key).")
    except (openai.APITimeoutError, openai.APIConnectionError):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach the AI service. Please try again.")
    except openai.APIError as exc:
        log.error("OpenAI API error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI service returned an error. Please try again.")


# ---------------------------------------------------------------- offline fallback
ACTIVE = {OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.ASSIGNED,
          OrderStatus.OUT_FOR_DELIVERY}


def _fmt(o: Order) -> str:
    items = ", ".join(f"{i.quantity}× {i.name}" for i in o.items)
    return f"#{o.id} · {o.restaurant.name if o.restaurant else ''} · ₹{o.total_amount:.0f} · {o.status.value} ({items})"


def offline_answer(question: str, orders: list[Order]) -> str:
    q = question.lower()
    note = "\n\n_(Offline insights: add an OPENAI_API_KEY on the server for AI-written answers.)_"
    paid = [o for o in orders if o.status not in (OrderStatus.CANCELLED, OrderStatus.REFUNDED)]

    if any(w in q for w in ("not delivered", "pending", "active", "still", "track", "where")):
        active = [o for o in orders if o.status in ACTIVE]
        body = ("Orders not yet delivered:\n" + "\n".join(f"- {_fmt(o)}" for o in active)) if active else "All your orders have been delivered or closed. 🎉"
        return body + note
    if any(w in q for w in ("spend", "spent", "cost", "money", "total")):
        now = utcnow()
        if "week" in q:
            since, label = now - timedelta(days=now.weekday(), hours=now.hour, minutes=now.minute), "this week"
        elif "month" in q:
            since, label = now.replace(day=1, hour=0, minute=0, second=0), "this month"
        elif "today" in q:
            since, label = now.replace(hour=0, minute=0, second=0), "today"
        else:
            since, label = None, "in total"
        sel = [o for o in paid if since is None or o.created_at >= since]
        return f"You spent ₹{sum(o.total_amount for o in sel):.2f} {label} across {len(sel)} order(s) (cancelled/refunded orders excluded)." + note
    if any(w in q for w in ("most", "frequent", "favourite", "favorite", "often")):
        c = Counter()
        for o in paid:
            for i in o.items:
                c[i.name] += i.quantity
        top = c.most_common(5)
        rest = Counter(o.restaurant.name for o in paid if o.restaurant).most_common(1)
        lines = "\n".join(f"- {n}: {q_} time(s)" for n, q_ in top) or "- no items yet"
        return f"Your most ordered items:\n{lines}" + (f"\n\nFavourite restaurant: {rest[0][0]} ({rest[0][1]} orders)." if rest else "") + note

    last = orders[:5]
    total = sum(o.total_amount for o in last if o in paid)
    return (f"Summary of your last {len(last)} order(s):\n" + "\n".join(f"- {_fmt(o)}" for o in last)
            + f"\n\nTotal spent on these: ₹{total:.2f}. You've placed {len(orders)} order(s) overall." + note)
