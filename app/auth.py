from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import JWTError, jwt

# Impostazioni segrete (in azienda si mettono in file .env)
SECRET_KEY = "la_tua_chiave_segretissima_e_lunga"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Funzione per criptare la password
def hash_password(password: str):
    return pwd_context.hash(password)

# Funzione per verificare se la password inserita è corretta
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# Funzione per creare il "Pass" (Token JWT)
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)