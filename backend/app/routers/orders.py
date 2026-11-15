"""Customer order APIs: place (dummy payment), history, details, cancel, review, return/refund request."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import MenuItem, Order, OrderItem, OrderStatus, PaymentLedger, PaymentStatus, Restaurant, ReturnStatus, Review, Role, User, utcnow
from ..schemas import OrderCreate, OrderOut, Page, ReturnIn, ReviewIn
from ..security import get_current_user, require_customer
from ..services.orders import apply_filters, check_transition, get_order_or_404, new_reference, paginate, record_refund, serialize

router = APIRouter(prefix="/api/orders", tags=["Customer orders"])


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def place_order(body: OrderCreate, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    restaurant = db.get(Restaurant, body.restaurant_id)
    if not restaurant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
    if not restaurant.is_open:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{restaurant.name} is currently closed")

    qty: dict[int, int] = {}
    for it in body.items:
        qty[it.menu_item_id] = qty.get(it.menu_item_id, 0) + it.quantity
    menu = {m.id: m for m in db.scalars(select(MenuItem).where(MenuItem.id.in_(qty))).all()}
    for mid in qty:
        m = menu.get(mid)
        if not m or m.restaurant_id != restaurant.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Dish {mid} does not belong to this restaurant")
        if not m.is_available:
            raise HTTPException(status.HTTP_409_CONFLICT, f"'{m.name}' is currently unavailable")

    # prices always come from the database, never from the client
    total = round(sum(menu[mid].price * q for mid, q in qty.items()), 2)
    order = Order(customer_id=user.id, restaurant_id=restaurant.id, total_amount=total, delivery_address=body.delivery_address.strip(),
                  contact_phone=(body.contact_phone or user.phone).strip(), notes=body.notes.strip(), status=OrderStatus.PLACED,
                  payment_status=PaymentStatus.pending)
    order.items = [OrderItem(menu_item_id=mid, name=menu[mid].name, unit_price=menu[mid].price, quantity=q) for mid, q in qty.items()]
    db.add(order)
    db.flush()

    # ---- dummy payment: always succeeds, recorded in the payment ledger
    db.add(PaymentLedger(order_id=order.id, entry_type="payment", amount=total, status="mock_paid", method=body.payment.method,
                         reference=new_reference("PAY"), note=f"Dummy payment ({body.payment.method}, ****{body.payment.card_last4})"))
    order.payment_status = PaymentStatus.mock_paid
    if not user.address:
        user.address = order.delivery_address
    db.commit()
    return serialize(get_order_or_404(db, order.id), Role.customer)


@router.get("", response_model=Page[OrderOut])
def my_orders(
    status_filter: OrderStatus | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    stmt = apply_filters(select(Order).where(Order.customer_id == user.id), status_filter, date_from, date_to)
    return paginate(db, stmt, page, size, Role.customer)


@router.get("/{order_id}", response_model=OrderOut)
def order_detail(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Visible to the ordering customer, the restaurant's owner and the assigned delivery partner only."""
    order = get_order_or_404(db, order_id)
    allowed = (
        (user.role == Role.customer and order.customer_id == user.id)
        or (user.role == Role.owner and order.restaurant.owner_id == user.id)
        or (user.role == Role.delivery and order.delivery_partner_id == user.id)
    )
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return serialize(order, user.role)


def _own_order(db: Session, order_id: int, user: User) -> Order:
    order = get_order_or_404(db, order_id)
    if order.customer_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: int, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = _own_order(db, order_id, user)
    if order.status != OrderStatus.PLACED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Orders can only be cancelled while PLACED (current: {order.status.value})")
    check_transition(Role.customer, order.status, OrderStatus.CANCELLED)
    order.status = OrderStatus.CANCELLED
    record_refund(db, order, "Auto-refund: order cancelled by customer")
    db.commit()
    return serialize(get_order_or_404(db, order.id), Role.customer)


@router.post("/{order_id}/review", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def review_order(order_id: int, body: ReviewIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = _own_order(db, order_id, user)
    if order.status != OrderStatus.DELIVERED:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can review an order only after it has been delivered")
    if order.review:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this order")
    db.add(Review(order_id=order.id, customer_id=user.id, restaurant_id=order.restaurant_id, rating=body.rating, comment=body.comment.strip()))
    db.commit()
    db.expire_all()
    return serialize(get_order_or_404(db, order.id), Role.customer)


@router.post("/{order_id}/return", response_model=OrderOut)
def request_return(order_id: int, body: ReturnIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = _own_order(db, order_id, user)
    if order.return_status != ReturnStatus.none:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A return request already exists for this order ({order.return_status.value})")
    if order.status != OrderStatus.DELIVERED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Returns/refunds can be requested only after the order is delivered")
    order.return_status = ReturnStatus.requested
    order.return_reason = body.reason.strip()
    order.return_requested_at = utcnow()
    db.commit()
    return serialize(get_order_or_404(db, order.id), Role.customer)
