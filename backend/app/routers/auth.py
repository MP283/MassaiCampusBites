from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Restaurant, Role, User
from ..schemas import LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    if body.role == Role.owner and not (body.restaurant_name or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Restaurant name is required for restaurant owners")
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=body.role,
                phone=body.phone.strip(), address=body.address.strip())
    db.add(user)
    db.flush()
    if body.role == Role.owner:
        db.add(Restaurant(owner_id=user.id, name=body.restaurant_name.strip(), cuisine=(body.cuisine or "").strip(),
                          address=body.address.strip(), description=f"Welcome to {body.restaurant_name.strip()}!"))
    db.commit()
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(user, k, v.strip())
    db.merge(user)
    db.commit()
    return user
