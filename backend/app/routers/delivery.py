"""Delivery-partner APIs: only orders assigned to the logged-in partner."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Order, OrderStatus, Role, User
from ..schemas import OrderOut, Page, StatusUpdate
from ..security import require_delivery
from ..services.orders import apply_filters, check_transition, get_order_or_404, paginate, serialize

router = APIRouter(prefix="/api/delivery", tags=["Delivery partner"])

ACTIVE = [OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]
HISTORY = [OrderStatus.DELIVERED, OrderStatus.REFUNDED]


@router.get("/orders", response_model=Page[OrderOut])
def my_deliveries(
    scope: str = Query("active", pattern="^(active|history|all)$"),
    status_filter: OrderStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    user: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    stmt = select(Order).where(Order.delivery_partner_id == user.id)
    if scope == "active":
        stmt = stmt.where(Order.status.in_(ACTIVE))
    elif scope == "history":
        stmt = stmt.where(Order.status.in_(HISTORY))
    stmt = apply_filters(stmt, status_filter, None, None)
    return paginate(db, stmt, page, size, Role.delivery)


def _assigned(db: Session, user: User, order_id: int) -> Order:
    order = get_order_or_404(db, order_id)
    if order.delivery_partner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.get("/orders/{order_id}", response_model=OrderOut)
def delivery_detail(order_id: int, user: User = Depends(require_delivery), db: Session = Depends(get_db)):
    return serialize(_assigned(db, user, order_id), Role.delivery)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_delivery_status(order_id: int, body: StatusUpdate, user: User = Depends(require_delivery), db: Session = Depends(get_db)):
    order = _assigned(db, user, order_id)
    check_transition(Role.delivery, order.status, body.status)
    order.status = body.status
    db.commit()
    db.expire_all()
    return serialize(get_order_or_404(db, order.id), Role.delivery)
