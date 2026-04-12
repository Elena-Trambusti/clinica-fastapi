import csv
import os
from io import StringIO

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .database import SessionLocal, engine

load_dotenv()

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Gestionale Clinica Pro")

app.mount("/static", StaticFiles(directory="static"), name="static")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
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


# --- AUTENTICAZIONE ---

@app.post("/register", response_model=schemas.UserResponse)
def registra_utente(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username già in uso")
    hashed_pwd = auth.hash_password(user.password)
    nuovo_utente = models.User(username=user.username, hashed_password=hashed_pwd)
    db.add(nuovo_utente)
    db.commit()
    db.refresh(nuovo_utente)
    return nuovo_utente


@app.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username o password errati")

    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# --- DASHBOARD ---

@app.get("/statistiche")
def get_statistiche(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return {
        "medici": db.query(models.Medico).count(),
        "pazienti": db.query(models.Paziente).count(),
        "turni": db.query(models.Turno).count(),
    }


# --- MEDICI ---

@app.get("/medici/", response_model=list[schemas.MedicoResponse])
def leggi_medici(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Medico).offset(skip).limit(limit).all()


@app.post("/medici/", response_model=schemas.MedicoResponse)
def crea_medico(
    medico: schemas.MedicoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    nuovo_medico = models.Medico(
        nome=medico.nome,
        cognome=medico.cognome,
        specializzazione=medico.specializzazione,
    )
    db.add(nuovo_medico)
    db.commit()
    db.refresh(nuovo_medico)
    return nuovo_medico


@app.put("/medici/{medico_id}", response_model=schemas.MedicoResponse)
def aggiorna_medico(
    medico_id: int,
    medico_aggiornato: schemas.MedicoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_medico = db.query(models.Medico).filter(models.Medico.id == medico_id).first()
    if not db_medico:
        raise HTTPException(status_code=404, detail="Medico non trovato")

    db_medico.nome = medico_aggiornato.nome
    db_medico.cognome = medico_aggiornato.cognome
    db_medico.specializzazione = medico_aggiornato.specializzazione
    db.commit()
    db.refresh(db_medico)
    return db_medico


@app.delete("/medici/{medico_id}")
def elimina_medico(
    medico_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    medico = db.query(models.Medico).filter(models.Medico.id == medico_id).first()
    if not medico:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    db.delete(medico)
    db.commit()
    return {"message": "Medico eliminato"}


# --- TURNI ---

@app.get("/turni/", response_model=list[schemas.TurnoResponse])
def leggi_turni(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Turno).offset(skip).limit(limit).all()


@app.post("/turni/", response_model=schemas.TurnoResponse)
def crea_turno(
    turno: schemas.TurnoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    conflitto_medico = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.medico_id == turno.medico_id,
    ).first()
    if conflitto_medico:
        raise HTTPException(
            status_code=400, detail="Il medico e' gia' impegnato a quest'ora"
        )

    conflitto_stanza = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.stanza == turno.stanza,
    ).first()
    if conflitto_stanza:
        raise HTTPException(
            status_code=400, detail="Stanza gia' occupata a quest'ora, sceglierne un'altra"
        )

    conflitto_paziente = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.paziente_id == turno.paziente_id,
    ).first()
    if conflitto_paziente:
        raise HTTPException(
            status_code=400, detail="Il paziente ha gia' una visita a quest'ora"
        )

    nuovo_turno = models.Turno(**turno.model_dump())
    db.add(nuovo_turno)
    db.commit()
    db.refresh(nuovo_turno)
    return nuovo_turno


@app.delete("/turni/{turno_id}")
def elimina_turno(
    turno_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_turno = db.query(models.Turno).filter(models.Turno.id == turno_id).first()
    if not db_turno:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    db.delete(db_turno)
    db.commit()
    return {"message": "Turno eliminato"}


# --- PAZIENTI ---

@app.get("/pazienti", response_model=list[schemas.Paziente])
def leggi_pazienti(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Paziente).offset(skip).limit(limit).all()


@app.post("/pazienti", response_model=schemas.Paziente)
def crea_paziente(
    paziente: schemas.PazienteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = db.query(models.Paziente).filter(
        models.Paziente.codice_fiscale == paziente.codice_fiscale
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice fiscale gia' registrato")
    db_paziente = models.Paziente(**paziente.model_dump())
    db.add(db_paziente)
    db.commit()
    db.refresh(db_paziente)
    return db_paziente


@app.put("/pazienti/{paziente_id}", response_model=schemas.Paziente)
def aggiorna_paziente(
    paziente_id: int,
    paziente_aggiornato: schemas.PazienteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_paziente = db.query(models.Paziente).filter(
        models.Paziente.id == paziente_id
    ).first()
    if not db_paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")

    db_paziente.nome = paziente_aggiornato.nome
    db_paziente.cognome = paziente_aggiornato.cognome
    db_paziente.codice_fiscale = paziente_aggiornato.codice_fiscale
    db_paziente.email = paziente_aggiornato.email
    db_paziente.telefono = paziente_aggiornato.telefono
    db.commit()
    db.refresh(db_paziente)
    return db_paziente


@app.delete("/pazienti/{paziente_id}")
def elimina_paziente(
    paziente_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    paziente = db.query(models.Paziente).filter(
        models.Paziente.id == paziente_id
    ).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    db.delete(paziente)
    db.commit()
    return {"message": "Paziente eliminato"}


# --- ESPORTAZIONE CSV ---

@app.get("/esporta-pazienti")
def esporta_pazienti(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pazienti = db.query(models.Paziente).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Nome", "Cognome", "Codice Fiscale", "Email", "Telefono"])
    for p in pazienti:
        writer.writerow([p.id, p.nome, p.cognome, p.codice_fiscale, p.email, p.telefono])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=lista_pazienti.csv"},
    )


@app.get("/esporta-turni")
def esporta_turni(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    turni = db.query(models.Turno).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Orario", "Stanza", "ID Medico", "ID Paziente"])
    for t in turni:
        writer.writerow([t.id, t.orario, t.stanza, t.medico_id, t.paziente_id])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=agenda_turni.csv"},
    )


# --- FRONTEND ---

@app.get("/")
async def read_index():
    return FileResponse("index.html")
