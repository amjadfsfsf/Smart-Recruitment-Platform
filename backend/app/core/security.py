from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from passlib.context import CryptContext

from app.data.database import SessionLocal
from app.data.models import User

security = HTTPBearer()

SECRET_KEY = "careerpath_ai_super_secret_key_2026_very_secure"
ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60

COMPANY_EMAIL_DOMAIN = "@aiproject.com"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def detect_role(email: str) -> str:
    return "company" if email.lower().endswith(COMPANY_EMAIL_DOMAIN) else "user"


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()

    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = int(user_id)

    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user
    finally:
        db.close()


def require_user(current_user: User = Depends(get_current_user)) -> User:
    if getattr(current_user, "role", "user") != "user":
        raise HTTPException(status_code=403, detail="Access restricted to user accounts")
    return current_user


def require_company(current_user: User = Depends(get_current_user)) -> User:
    if getattr(current_user, "role", "user") != "company":
        raise HTTPException(status_code=403, detail="Access restricted to company accounts")
    return current_user


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # Graceful fallback for legacy plaintext entries if any exist
        return plain_password == hashed_password
