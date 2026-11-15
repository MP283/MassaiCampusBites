"""Order lifecycle rules, serialisation and pagination helpers."""
import math
import secrets
from datetime import datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Order, OrderStatus, PaymentLedger, PaymentStatus, ReturnStatus, Role, utcnow
from ..schemas import OrderOut, PersonOut, ReviewOut

S = OrderStatus

# Which role may move an order from one status to another.
TRANSITIONS: dict[Role, dict[OrderStatus, set[OrderStatus]]] = {
    Role.customer: {S.PLACED: {S.CANCELLED}},
    Role.owner: {
        S.PLACED: {S.ACCEPTED, S.CANCELLED},  # owner may reject a new order
        S.ACCEPTED: {S.PREPARING},
        S.PREPARING: {S.READY},
        # READY -> ASSIGNED happens through the dedicated assign endpoint
    },
    Role.delivery: {S.ASSIGNED: {S.OUT_FOR_DELIVERY}, S.OUT_FOR_DELIVERY: {S.DELIVERED}},
}


def check_transition(role: Role, current: OrderStatus, target: OrderStatus):
    allowed = TRANSITIONS.get(role, {}).get(current, set())
    if target not in allowed:
        nxt = ", ".join(s.value for s in allowed) or "none"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Invalid status transition {current.value} -> {target.value} for {role.value}. Allowed next: {nxt}",
        )


def order_options():
    return (
        selectinload(Order.items),
        selectinload(Order.restaurant),
        selectinload(Order.customer),
        selectinload(Order.delivery_partner),
        selectinload(Order.review),
        selectinload(Order.payments),
    )


def new_reference(prefix: str) -> str:
    return f"{prefix}-{utcnow():%Y%m%d}-{secrets.token_hex(4).upper()}"


def record_refund(db: Session, order: Order, note: str):
    """Mark payment refunded and add a refund ledger entry (only if it was paid)."""
    if order.payment_status == PaymentStatus.mock_paid:
        db.add(PaymentLedger(order_id=order.id, entry_type="refund", amount=order.total_amount, status="refunded",
                             method="dummy_refund", reference=new_reference("RFND"), note=note))
        order.payment_status = PaymentStatus.refunded


def person(u, include_contact=False):
    if not u:
        return None
    return PersonOut(id=u.id, name=u.name, phone=u.phone if include_contact else "",
                     address=u.address if include_contact else "", email=u.email if include_contact else "")


def serialize(order: Order, viewer_role: Role) -> OrderOut:
    out = OrderOut.model_validate(order, from_attributes=True)
    out.restaurant_name = order.restaurant.name if order.restaurant else ""
    # contact details only for the people who need them
    out.customer = person(order.customer, include_contact=viewer_role in (Role.owner, Role.delivery))
    out.delivery_partner = person(order.delivery_partner, include_contact=True)
    out.review = ReviewOut(id=order.review.id, order_id=order.id, rating=order.review.rating, comment=order.review.comment,
                           created_at=order.review.created_at, customer_name=order.customer.name if order.customer else "") if order.review else None
    out.payments = sorted(out.payments, key=lambda p: p.created_at)
    if viewer_role == Role.customer:
        out.can_cancel = order.status == S.PLACED
        out.can_review = order.status == S.DELIVERED and order.review is None
        out.can_request_return = order.status == S.DELIVERED and order.return_status == ReturnStatus.none
    return out


def apply_filters(stmt, status_filter: OrderStatus | None, date_from, date_to):
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if date_from:
        stmt = stmt.where(Order.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        stmt = stmt.where(Order.created_at < datetime.combine(date_to, time.min) + timedelta(days=1))
    return stmt


def paginate(db: Session, stmt, page: int, size: int, role: Role):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.options(*order_options()).order_by(Order.created_at.desc(), Order.id.desc())
                      .offset((page - 1) * size).limit(size)).all()
    return {"items": [serialize(o, role) for o in rows], "total": total, "page": page, "size": size,
            "pages": max(1, math.ceil(total / size))}


def get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id).options(*order_options()))
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order
