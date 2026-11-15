"""Restaurant-owner APIs: restaurant profile, menu management, orders, delivery assignment, returns, stats, reminders."""
from collections import Counter
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import MenuItem, Order, OrderItem, OrderStatus, ReminderLog, Restaurant, ReturnStatus, Review, Role, User, utcnow
from ..schemas import (AssignIn, MenuItemIn, MenuItemOut, MenuItemUpdate, OrderOut, Page, PersonOut, ReminderOut, RestaurantIn,
                       RestaurantOut, ReturnDecision, StatsOut, StatusUpdate)
from ..security import require_owner
from ..services.orders import apply_filters, check_transition, get_order_or_404, paginate, record_refund, serialize
from ..services.reminders import generate_reminders
from .restaurants import restaurant_out

router = APIRouter(prefix="/api/owner", tags=["Restaurant owner"])


def my_restaurant(db: Session, user: User) -> Restaurant:
    r = db.scalar(select(Restaurant).where(Restaurant.owner_id == user.id).order_by(Restaurant.id))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't have a restaurant yet")
    return r


def my_order(db: Session, user: User, order_id: int) -> Order:
    order = get_order_or_404(db, order_id)
    if order.restaurant.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def my_item(db: Session, user: User, item_id: int) -> MenuItem:
    item = db.get(MenuItem, item_id)
    if not item or item.restaurant.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dish not found")
    return item


# ---------------------------------------------------------------- restaurant profile
@router.get("/restaurant", response_model=RestaurantOut)
def get_my_restaurant(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    return restaurant_out(db, my_restaurant(db, user))


@router.put("/restaurant", response_model=RestaurantOut)
def update_my_restaurant(body: RestaurantIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    r = my_restaurant(db, user)
    for k, v in body.model_dump().items():
        setattr(r, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return restaurant_out(db, r)


# ---------------------------------------------------------------- menu management
@router.get("/menu", response_model=list[MenuItemOut])
def list_menu(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    r = my_restaurant(db, user)
    return db.scalars(select(MenuItem).where(MenuItem.restaurant_id == r.id).order_by(MenuItem.category, MenuItem.name)).all()


@router.post("/menu", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def add_dish(body: MenuItemIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    r = my_restaurant(db, user)
    item = MenuItem(restaurant_id=r.id, **{k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items()})
    db.add(item)
    db.commit()
    return item


@router.put("/menu/{item_id}", response_model=MenuItemOut)
def update_dish(item_id: int, body: MenuItemUpdate, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    item = my_item(db, user, item_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(item, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return item


@router.patch("/menu/{item_id}/availability", response_model=MenuItemOut)
def set_availability(item_id: int, is_available: bool = Query(...), user: User = Depends(require_owner), db: Session = Depends(get_db)):
    item = my_item(db, user, item_id)
    item.is_available = is_available
    db.commit()
    return item


@router.delete("/menu/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dish(item_id: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    db.delete(my_item(db, user, item_id))  # past order items keep a name/price snapshot
    db.commit()


# ---------------------------------------------------------------- orders
@router.get("/orders", response_model=Page[OrderOut])
def restaurant_orders(
    status_filter: OrderStatus | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    r = my_restaurant(db, user)
    stmt = apply_filters(select(Order).where(Order.restaurant_id == r.id), status_filter, date_from, date_to)
    return paginate(db, stmt, page, size, Role.owner)


@router.get("/orders/{order_id}", response_model=OrderOut)
def restaurant_order(order_id: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    return serialize(my_order(db, user, order_id), Role.owner)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(order_id: int, body: StatusUpdate, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    order = my_order(db, user, order_id)
    check_transition(Role.owner, order.status, body.status)
    order.status = body.status
    if body.status == OrderStatus.CANCELLED:
        record_refund(db, order, "Auto-refund: order rejected by restaurant")
    db.commit()
    db.expire_all()
    return serialize(get_order_or_404(db, order.id), Role.owner)


@router.get("/delivery-partners", response_model=list[PersonOut])
def delivery_partners(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    partners = db.scalars(select(User).where(User.role == Role.delivery).order_by(User.name)).all()
    active = dict(db.execute(select(Order.delivery_partner_id, func.count(Order.id))
                             .where(Order.status.in_([OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]))
                             .group_by(Order.delivery_partner_id)).all())
    return [PersonOut(id=p.id, name=f"{p.name} ({active.get(p.id, 0)} active)", phone=p.phone) for p in partners]


@router.post("/orders/{order_id}/assign", response_model=OrderOut)
def assign_delivery(order_id: int, body: AssignIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    order = my_order(db, user, order_id)
    if order.status != OrderStatus.READY:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A delivery partner can be assigned only when the order is READY (current: {order.status.value})")
    partner = db.get(User, body.delivery_partner_id)
    if not partner or partner.role != Role.delivery:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Selected user is not a delivery partner")
    order.delivery_partner_id = partner.id
    order.status = OrderStatus.ASSIGNED
    db.commit()
    db.expire_all()
    return serialize(get_order_or_404(db, order.id), Role.owner)


# ---------------------------------------------------------------- returns / refunds
@router.get("/returns", response_model=Page[OrderOut])
def return_requests(
    return_status: ReturnStatus = Query(ReturnStatus.requested),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    r = my_restaurant(db, user)
    stmt = select(Order).where(Order.restaurant_id == r.id, Order.return_status == return_status)
    return paginate(db, stmt, page, size, Role.owner)


@router.post("/orders/{order_id}/return-decision", response_model=OrderOut)
def decide_return(order_id: int, body: ReturnDecision, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    order = my_order(db, user, order_id)
    if order.return_status != ReturnStatus.requested:
        raise HTTPException(status.HTTP_409_CONFLICT, f"No pending return request for this order (return status: {order.return_status.value})")
    if body.approve:
        order.return_status = ReturnStatus.approved
        order.status = OrderStatus.REFUNDED
        record_refund(db, order, f"Return approved by restaurant. {body.note}".strip())
    else:
        order.return_status = ReturnStatus.rejected
    db.commit()
    db.expire_all()
    return serialize(get_order_or_404(db, order.id), Role.owner)


# ---------------------------------------------------------------- statistics
@router.get("/stats", response_model=StatsOut)
def stats(days: int = Query(7, ge=1, le=90), user: User = Depends(require_owner), db: Session = Depends(get_db)):
    r = my_restaurant(db, user)
    today = datetime.combine(utcnow().date(), time.min)
    earning = [s for s in OrderStatus if s not in (OrderStatus.CANCELLED, OrderStatus.REFUNDED)]

    status_counts = {s.value: c for s, c in db.execute(
        select(Order.status, func.count(Order.id)).where(Order.restaurant_id == r.id).group_by(Order.status)).all()}
    total_orders = sum(status_counts.values())
    revenue = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.restaurant_id == r.id, Order.status.in_(earning))) or 0
    earning_count = db.scalar(select(func.count(Order.id)).where(Order.restaurant_id == r.id, Order.status.in_(earning))) or 0
    orders_today = db.scalar(select(func.count(Order.id)).where(Order.restaurant_id == r.id, Order.created_at >= today)) or 0
    revenue_today = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)).where(
        Order.restaurant_id == r.id, Order.created_at >= today, Order.status.in_(earning))) or 0
    avg_rating, review_count = db.execute(select(func.avg(Review.rating), func.count(Review.id)).where(Review.restaurant_id == r.id)).one()
    pending = sum(status_counts.get(s, 0) for s in ("PLACED", "ACCEPTED", "PREPARING", "READY"))
    pending_returns = db.scalar(select(func.count(Order.id)).where(Order.restaurant_id == r.id, Order.return_status == ReturnStatus.requested)) or 0

    top = db.execute(select(OrderItem.name, func.sum(OrderItem.quantity).label("qty"), func.sum(OrderItem.quantity * OrderItem.unit_price))
                     .join(Order).where(Order.restaurant_id == r.id, Order.status.in_(earning))
                     .group_by(OrderItem.name).order_by(func.sum(OrderItem.quantity).desc()).limit(5)).all()

    start = today - timedelta(days=days - 1)
    recent = db.execute(select(Order.created_at, Order.total_amount, Order.status).where(Order.restaurant_id == r.id, Order.created_at >= start)).all()
    by_day = Counter()
    rev_day = Counter()
    for created, amount, st in recent:
        key = created.date().isoformat()
        by_day[key] += 1
        if st in earning:
            rev_day[key] += amount
    daily = [{"date": (start + timedelta(days=i)).date().isoformat(), "orders": by_day[(start + timedelta(days=i)).date().isoformat()],
              "revenue": round(rev_day[(start + timedelta(days=i)).date().isoformat()], 2)} for i in range(days)]

    return StatsOut(restaurant_id=r.id, total_orders=total_orders, orders_today=orders_today, revenue=round(revenue, 2),
                    revenue_today=round(revenue_today, 2), average_order_value=round(revenue / earning_count, 2) if earning_count else 0,
                    average_rating=round(float(avg_rating), 2) if avg_rating is not None else None, review_count=review_count,
                    pending_orders=pending, pending_returns=pending_returns, status_counts=status_counts,
                    top_items=[{"name": n, "quantity": int(q), "revenue": round(float(rv), 2)} for n, q, rv in top], daily=daily)


# ---------------------------------------------------------------- reminders
@router.get("/reminders", response_model=list[ReminderOut])
def reminders(background: BackgroundTasks, include_resolved: bool = False, user: User = Depends(require_owner),
              db: Session = Depends(get_db)):
    r = my_restaurant(db, user)
    background.add_task(generate_reminders)  # FastAPI background task: refresh reminders after responding
    stmt = select(ReminderLog).where(ReminderLog.restaurant_id == r.id)
    if not include_resolved:
        stmt = stmt.where(ReminderLog.is_resolved.is_(False))
    return db.scalars(stmt.order_by(ReminderLog.created_at.desc()).limit(50)).all()


@router.post("/reminders/{reminder_id}/resolve", response_model=ReminderOut)
def resolve_reminder(reminder_id: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    rem = db.get(ReminderLog, reminder_id)
    if not rem or rem.restaurant_id != my_restaurant(db, user).id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")
    rem.is_resolved = True
    db.commit()
    return rem
