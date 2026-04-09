from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt

# Importiamo i nostri file locali
from . import models, schemas, auth
from .database import SessionLocal, engine

# Crea le tabelle nel database (inclusa la nuova tabella Users)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Gestionale Clinica Pro")

# Permessi per far parlare il frontend con il backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURAZIONE SICUREZZA ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Funzione "buttafuori" che controlla se il Token è valido
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Token non valido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token non valido")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    return user


# --- ROTTE DI AUTENTICAZIONE (Sbloccate per tutti) ---

@app.post("/register", response_model=schemas.UserResponse)
def registra_utente(user: schemas.UserCreate, db: Session = Depends(get_db)):
    hashed_pwd = auth.hash_password(user.password)
    nuovo_utente = models.User(username=user.username, hashed_password=hashed_pwd)
    db.add(nuovo_utente)
    db.commit()
    db.refresh(nuovo_utente)
    return nuovo_utente

@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username o password errati")
    
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# --- ROTTE PROTETTE (Richiedono il login) ---

@app.get("/medici/", response_model=list[schemas.MedicoResponse])
def leggi_medici(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Medico).all()

@app.post("/medici/", response_model=schemas.MedicoResponse)
def crea_medico(medico: schemas.MedicoCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    nuovo_medico = models.Medico(nome=medico.nome, cognome=medico.cognome, specializzazione=medico.specializzazione)
    db.add(nuovo_medico)
    db.commit()
    db.refresh(nuovo_medico)
    return nuovo_medico

@app.get("/turni/", response_model=list[schemas.TurnoResponse])
def leggi_turni(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Turno).all()

@app.post("/turni/", response_model=schemas.TurnoResponse)
def crea_turno(turno: schemas.TurnoCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    nuovo_turno = models.Turno(orario=turno.orario, stanza=turno.stanza, medico_id=turno.medico_id)
    db.add(nuovo_turno)
    db.commit()
    db.refresh(nuovo_turno)
    return nuovo_turno

from fastapi.responses import FileResponse

@app.get("/")
async def read_index():
    return FileResponse('index.html')