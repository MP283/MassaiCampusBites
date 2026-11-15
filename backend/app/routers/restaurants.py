"""Public browsing: restaurants, menus (search + price filter) and reviews."""
import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import MenuItem, Restaurant, Review
from ..schemas import MenuItemOut, Page, RestaurantOut, ReviewOut

router = APIRouter(prefix="/api/restaurants", tags=["Restaurants"])


def restaurant_out(db: Session, r: Restaurant) -> RestaurantOut:
    avg, count = db.execute(select(func.avg(Review.rating), func.count(Review.id)).where(Review.restaurant_id == r.id)).one()
    items = db.scalar(select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == r.id, MenuItem.is_available.is_(True))) or 0
    out = RestaurantOut.model_validate(r)
    out.avg_rating = round(float(avg), 1) if avg is not None else None
    out.review_count = count
    out.item_count = items
    return out


@router.get("", response_model=Page[RestaurantOut])
def list_restaurants(
    search: str | None = Query(None, max_length=100, description="Matches restaurant name, cuisine or dish name"),
    cuisine: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = select(Restaurant)
    if search:
        like = f"%{search.strip()}%"
        dish_match = select(MenuItem.restaurant_id).where(MenuItem.name.ilike(like))
        stmt = stmt.where(or_(Restaurant.name.ilike(like), Restaurant.cuisine.ilike(like), Restaurant.id.in_(dish_match)))
    if cuisine:
        stmt = stmt.where(Restaurant.cuisine.ilike(f"%{cuisine.strip()}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Restaurant.is_open.desc(), Restaurant.name).offset((page - 1) * size).limit(size)).all()
    return {"items": [restaurant_out(db, r) for r in rows], "total": total, "page": page, "size": size, "pages": max(1, math.ceil(total / size))}


@router.get("/cuisines", response_model=list[str])
def cuisines(db: Session = Depends(get_db)):
    return sorted({c for c in db.scalars(select(Restaurant.cuisine)).all() if c})


@router.get("/{restaurant_id}", response_model=RestaurantOut)
def get_restaurant(restaurant_id: int, db: Session = Depends(get_db)):
    r = db.get(Restaurant, restaurant_id)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
    return restaurant_out(db, r)


@router.get("/{restaurant_id}/menu", response_model=list[MenuItemOut])
def get_menu(
    restaurant_id: int,
    search: str | None = Query(None, max_length=100, description="Dish name contains"),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    category: str | None = Query(None, max_length=60),
    veg_only: bool = False,
    include_unavailable: bool = True,
    sort: str = Query("category", pattern="^(category|price_asc|price_desc|name)$"),
    db: Session = Depends(get_db),
):
    if not db.get(Restaurant, restaurant_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "min_price cannot be greater than max_price")
    stmt = select(MenuItem).where(MenuItem.restaurant_id == restaurant_id)
    if search:
        stmt = stmt.where(MenuItem.name.ilike(f"%{search.strip()}%"))
    if min_price is not None:
        stmt = stmt.where(MenuItem.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(MenuItem.price <= max_price)
    if category:
        stmt = stmt.where(MenuItem.category == category)
    if veg_only:
        stmt = stmt.where(MenuItem.is_veg.is_(True))
    if not include_unavailable:
        stmt = stmt.where(MenuItem.is_available.is_(True))
    order = {"category": (MenuItem.category, MenuItem.name), "price_asc": (MenuItem.price,), "price_desc": (MenuItem.price.desc(),),
             "name": (MenuItem.name,)}[sort]
    return db.scalars(stmt.order_by(*order)).all()


@router.get("/{restaurant_id}/reviews", response_model=list[ReviewOut])
def get_reviews(restaurant_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.restaurant_id == restaurant_id).order_by(Review.created_at.desc()).limit(limit)).all()
    return [ReviewOut(id=r.id, order_id=r.order_id, rating=r.rating, comment=r.comment, created_at=r.created_at,
                      customer_name=r.customer.name if r.customer else "") for r in rows]
