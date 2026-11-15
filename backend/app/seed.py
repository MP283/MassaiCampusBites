"""Demo data (runs on startup when the users table is empty). Run manually: python -m app.seed"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (MenuItem, Order, OrderItem, OrderStatus, PaymentLedger, PaymentStatus, Restaurant, ReturnStatus, Review, Role,
                     User, utcnow)
from .security import hash_password
from .services.orders import new_reference

PASSWORD = "password123"

RESTAURANTS = [
    ("owner@demo.com", "Ravi Kumar", "Spice Hub", "North Indian", "Block A, Campus Food Court",
     "Rich curries, tandoor breads and biryanis cooked fresh.", [
         ("Paneer Butter Masala", "Cottage cheese in a creamy tomato gravy", 220, "Curries", True),
         ("Chicken Biryani", "Fragrant basmati rice layered with spiced chicken", 260, "Rice", False),
         ("Veg Biryani", "Basmati rice with seasonal vegetables and saffron", 200, "Rice", True),
         ("Dal Makhani", "Slow-cooked black lentils with butter", 180, "Curries", True),
         ("Butter Naan", "Soft tandoor bread brushed with butter", 40, "Breads", True),
         ("Garlic Naan", "Tandoor bread with garlic and coriander", 50, "Breads", True),
         ("Gulab Jamun (2 pcs)", "Warm milk dumplings in sugar syrup", 70, "Desserts", True),
         ("Masala Chaas", "Spiced buttermilk", 45, "Drinks", True),
     ]),
    ("owner2@demo.com", "Meera Shah", "Campus Pizza Co.", "Italian", "Near Library Gate",
     "Wood-fired pizzas, pastas and garlic bread.", [
         ("Margherita Pizza", "Tomato, mozzarella and basil", 249, "Pizza", True),
         ("Farmhouse Pizza", "Capsicum, onion, mushroom and corn", 329, "Pizza", True),
         ("Chicken Pepperoni Pizza", "Loaded with chicken pepperoni", 379, "Pizza", False),
         ("Penne Arrabbiata", "Spicy tomato sauce pasta", 229, "Pasta", True),
         ("Alfredo Pasta", "Creamy white-sauce pasta", 249, "Pasta", True),
         ("Cheesy Garlic Bread", "Baked with mozzarella", 129, "Sides", True),
         ("Choco Lava Cake", "Molten chocolate centre", 99, "Desserts", True),
         ("Cold Coffee", "Chilled and frothy", 89, "Drinks", True),
     ]),
    ("owner3@demo.com", "Arjun Rao", "Green Bowl", "Healthy", "Sports Complex",
     "Salads, wraps and smoothie bowls for the fitness crowd.", [
         ("Quinoa Salad Bowl", "Quinoa, chickpeas, veggies, lemon dressing", 199, "Bowls", True),
         ("Grilled Chicken Bowl", "Brown rice, grilled chicken, greens", 249, "Bowls", False),
         ("Falafel Wrap", "Falafel, hummus and veggies in a whole-wheat wrap", 159, "Wraps", True),
         ("Paneer Tikka Wrap", "Smoky paneer with mint chutney", 169, "Wraps", True),
         ("Berry Smoothie Bowl", "Mixed berries, banana, granola", 179, "Smoothies", True),
         ("Fresh Lime Soda", "Sweet or salted", 59, "Drinks", True),
     ]),
]


def _user(db, email, name, role, phone="", address=""):
    u = User(name=name, email=email, password_hash=hash_password(PASSWORD), role=role, phone=phone, address=address)
    db.add(u)
    db.flush()
    return u


def _order(db, customer, restaurant, picks, status, minutes_ago, partner=None, review=None, return_status=ReturnStatus.none,
           reason=""):
    when = utcnow() - timedelta(minutes=minutes_ago)
    items = [OrderItem(menu_item_id=m.id, name=m.name, unit_price=m.price, quantity=q) for m, q in picks]
    total = round(sum(i.unit_price * i.quantity for i in items), 2)
    o = Order(customer_id=customer.id, restaurant_id=restaurant.id, delivery_partner_id=partner.id if partner else None, status=status,
              total_amount=total, delivery_address=customer.address, contact_phone=customer.phone, payment_status=PaymentStatus.mock_paid,
              return_status=return_status, return_reason=reason, created_at=when, updated_at=when, items=items)
    if return_status != ReturnStatus.none:
        o.return_requested_at = when + timedelta(hours=1)
    db.add(o)
    db.flush()
    db.add(PaymentLedger(order_id=o.id, entry_type="payment", amount=total, status="mock_paid", method="dummy_card",
                         reference=new_reference("PAY"), note="Dummy payment (dummy_card, ****4242)", created_at=when))
    if status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
        o.payment_status = PaymentStatus.refunded
        db.add(PaymentLedger(order_id=o.id, entry_type="refund", amount=total, status="refunded", method="dummy_refund",
                             reference=new_reference("RFND"), note="Refund (demo data)", created_at=when + timedelta(hours=2)))
    if review:
        db.add(Review(order_id=o.id, customer_id=customer.id, restaurant_id=restaurant.id, rating=review[0], comment=review[1],
                      created_at=when + timedelta(hours=1)))
    return o


def seed(db: Session):
    if db.scalar(select(User.id).limit(1)):
        return
    cust = _user(db, "customer@demo.com", "Aditi Verma", Role.customer, "9876500001", "Room 214, Hostel B, North Campus")
    cust2 = _user(db, "customer2@demo.com", "Rahul Nair", Role.customer, "9876500002", "Room 108, Hostel D, South Campus")
    d1 = _user(db, "delivery@demo.com", "Suresh Yadav", Role.delivery, "9876500101")
    _user(db, "delivery2@demo.com", "Imran Khan", Role.delivery, "9876500102")

    rest = {}
    for email, owner_name, rname, cuisine, addr, desc, dishes in RESTAURANTS:
        owner = _user(db, email, owner_name, Role.owner, "98765002" + str(len(rest) + 10), addr)
        r = Restaurant(owner_id=owner.id, name=rname, cuisine=cuisine, address=addr, description=desc)
        db.add(r)
        db.flush()
        r.menu_items = [MenuItem(restaurant_id=r.id, name=n, description=d, price=p, category=c, is_veg=v) for n, d, p, c, v in dishes]
        db.flush()
        rest[rname] = r

    m = {r: {i.name: i for i in rest[r].menu_items} for r in rest}
    sh, pz, gb = "Spice Hub", "Campus Pizza Co.", "Green Bowl"
    day = 60 * 24
    # Aditi's history: a mix of every lifecycle stage
    _order(db, cust, rest[sh], [(m[sh]["Paneer Butter Masala"], 1), (m[sh]["Butter Naan"], 3)], OrderStatus.DELIVERED, 6 * day, d1,
           review=(5, "Super tasty and hot on arrival!"))
    _order(db, cust, rest[pz], [(m[pz]["Farmhouse Pizza"], 1), (m[pz]["Cold Coffee"], 2)], OrderStatus.DELIVERED, 4 * day, d1)
    _order(db, cust, rest[sh], [(m[sh]["Veg Biryani"], 2), (m[sh]["Masala Chaas"], 2)], OrderStatus.DELIVERED, 2 * day, d1,
           return_status=ReturnStatus.requested, reason="One biryani was missing from the bag.")
    _order(db, cust, rest[gb], [(m[gb]["Falafel Wrap"], 2)], OrderStatus.CANCELLED, 3 * day)
    _order(db, cust, rest[sh], [(m[sh]["Dal Makhani"], 1), (m[sh]["Garlic Naan"], 2)], OrderStatus.OUT_FOR_DELIVERY, 40, d1)
    _order(db, cust, rest[sh], [(m[sh]["Paneer Butter Masala"], 2), (m[sh]["Butter Naan"], 4)], OrderStatus.READY, 25)
    _order(db, cust, rest[sh], [(m[sh]["Gulab Jamun (2 pcs)"], 2)], OrderStatus.PLACED, 30)  # > 15 min -> reminder
    _order(db, cust, rest[pz], [(m[pz]["Margherita Pizza"], 1)], OrderStatus.PLACED, 3)
    # Rahul
    _order(db, cust2, rest[sh], [(m[sh]["Chicken Biryani"], 1)], OrderStatus.DELIVERED, 5 * day, d1, review=(4, "Good portion size."))
    _order(db, cust2, rest[sh], [(m[sh]["Dal Makhani"], 1), (m[sh]["Butter Naan"], 2)], OrderStatus.ACCEPTED, 20)
    _order(db, cust2, rest[sh], [(m[sh]["Veg Biryani"], 1)], OrderStatus.ASSIGNED, 15, d1)
    db.commit()
    print("[seed] Demo data created. Password for all demo users:", PASSWORD)


if __name__ == "__main__":
    from .database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as s:
        seed(s)
