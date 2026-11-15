"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import OrderStatus, PaymentStatus, ReturnStatus, Role

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


# ---------------------------------------------------------------- auth / users
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: Role = Role.customer
    phone: str = Field("", max_length=30)
    address: str = Field("", max_length=300)
    restaurant_name: str | None = Field(None, max_length=120)  # owners only
    cuisine: str | None = Field(None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    role: Role
    phone: str
    address: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = Field(None, max_length=30)
    address: str | None = Field(None, max_length=300)


# ---------------------------------------------------------------- restaurants / menu
class RestaurantIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field("", max_length=2000)
    cuisine: str = Field("", max_length=80)
    address: str = Field("", max_length=300)
    image_url: str = Field("", max_length=500)
    is_open: bool = True


class RestaurantOut(ORM):
    id: int
    owner_id: int
    name: str
    description: str
    cuisine: str
    address: str
    image_url: str
    is_open: bool
    avg_rating: float | None = None
    review_count: int = 0
    item_count: int = 0


class MenuItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=1000)
    price: float = Field(gt=0, le=100000)
    category: str = Field("Main", max_length=60)
    is_veg: bool = True
    is_available: bool = True
    image_url: str = Field("", max_length=500)


class MenuItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=1000)
    price: float | None = Field(None, gt=0, le=100000)
    category: str | None = Field(None, max_length=60)
    is_veg: bool | None = None
    is_available: bool | None = None
    image_url: str | None = Field(None, max_length=500)


class MenuItemOut(ORM):
    id: int
    restaurant_id: int
    name: str
    description: str
    price: float
    category: str
    is_veg: bool
    is_available: bool
    image_url: str


class ReviewOut(ORM):
    id: int
    order_id: int
    rating: int
    comment: str
    created_at: datetime
    customer_name: str = ""


# ---------------------------------------------------------------- orders
class CartItemIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=50)


class DummyPaymentIn(BaseModel):
    method: Literal["dummy_card", "dummy_upi", "cash_on_delivery"] = "dummy_card"
    card_last4: str = Field("4242", pattern=r"^\d{4}$")


class OrderCreate(BaseModel):
    restaurant_id: int
    items: list[CartItemIn] = Field(min_length=1, max_length=50)
    delivery_address: str = Field(min_length=5, max_length=300)
    contact_phone: str = Field("", max_length=30)
    notes: str = Field("", max_length=500)
    payment: DummyPaymentIn = DummyPaymentIn()


class OrderItemOut(ORM):
    id: int
    menu_item_id: int | None
    name: str
    unit_price: float
    quantity: int


class PaymentOut(ORM):
    id: int
    entry_type: str
    amount: float
    status: str
    method: str
    reference: str
    note: str
    created_at: datetime


class PersonOut(BaseModel):
    id: int
    name: str
    phone: str = ""
    address: str = ""
    email: str = ""


class OrderOut(ORM):
    id: int
    customer_id: int
    restaurant_id: int
    restaurant_name: str = ""
    delivery_partner_id: int | None
    status: OrderStatus
    total_amount: float
    delivery_address: str
    contact_phone: str
    notes: str
    payment_status: PaymentStatus
    return_status: ReturnStatus
    return_reason: str
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut] = []
    customer: PersonOut | None = None
    delivery_partner: PersonOut | None = None
    review: ReviewOut | None = None
    payments: list[PaymentOut] = []
    can_cancel: bool = False
    can_review: bool = False
    can_request_return: bool = False


class StatusUpdate(BaseModel):
    status: OrderStatus


class AssignIn(BaseModel):
    delivery_partner_id: int


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=1000)


class ReturnIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class ReturnDecision(BaseModel):
    approve: bool
    note: str = Field("", max_length=300)


# ---------------------------------------------------------------- owner extras
class ReminderOut(ORM):
    id: int
    order_id: int
    restaurant_id: int
    status_at_reminder: str
    message: str
    is_resolved: bool
    created_at: datetime


class StatsOut(BaseModel):
    restaurant_id: int
    total_orders: int
    orders_today: int
    revenue: float
    revenue_today: float
    average_order_value: float
    average_rating: float | None
    review_count: int
    pending_orders: int
    pending_returns: int
    status_counts: dict[str, int]
    top_items: list[dict]
    daily: list[dict]


# ---------------------------------------------------------------- AI
class AIQuestion(BaseModel):
    question: str = Field("Summarize my last five orders.", min_length=3, max_length=500)


class AIAnswer(BaseModel):
    answer: str
    source: Literal["openai", "offline"]
    orders_considered: int
