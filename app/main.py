import csv
from io import StringIO
from fastapi.responses import StreamingResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

app.mount("/static", StaticFiles(directory="static"), name="static")

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

# --- DASHBOARD STATISTICHE ---
@app.get("/statistiche")
def get_statistiche(db: Session = Depends(get_db)):
    # Contiamo quante righe ci sono in ogni tabella
    tot_medici = db.query(models.Medico).count()
    tot_pazienti = db.query(models.Paziente).count()
    tot_turni = db.query(models.Turno).count()
    
    # Restituiamo i numeri
    return {
        "medici": tot_medici,
        "pazienti": tot_pazienti,
        "turni": tot_turni
    }

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

# --- MODIFICA UN MEDICO ---
@app.put("/medici/{medico_id}", response_model=schemas.MedicoResponse)
def aggiorna_medico(medico_id: int, medico_aggiornato: schemas.MedicoCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Cerchiamo il medico nel DB
    db_medico = db.query(models.Medico).filter(models.Medico.id == medico_id).first()
    
    if not db_medico:
        raise HTTPException(status_code=404, detail="Medico non trovato")

    # Aggiorniamo i dati
    db_medico.nome = medico_aggiornato.nome
    db_medico.cognome = medico_aggiornato.cognome
    db_medico.specializzazione = medico_aggiornato.specializzazione

    db.commit()
    db.refresh(db_medico)
    return db_medico

@app.get("/turni/", response_model=list[schemas.TurnoResponse])
def leggi_turni(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Turno).all()

@app.post("/turni/", response_model=schemas.TurnoResponse)
def crea_turno(turno: schemas.TurnoCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. CONTROLLO MEDICO: Il medico è già occupato a quell'ora?
    conflitto_medico = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.medico_id == turno.medico_id
    ).first()
    
    if conflitto_medico:
        raise HTTPException(status_code=400, detail="Il medico è già impegnato a quest'ora! 🚫")

    # 2. CONTROLLO STANZA: La stanza è già occupata a quell'ora?
    conflitto_stanza = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.stanza == turno.stanza
    ).first()
    
    if conflitto_stanza:
        raise HTTPException(status_code=400, detail="Stanza già occupata! Scegline un'altra. 🚫")
# 2b. CONTROLLO PAZIENTE: Il paziente ha già un altro appuntamento a quell'ora?
    conflitto_paziente = db.query(models.Turno).filter(
        models.Turno.orario == turno.orario,
        models.Turno.paziente_id == turno.paziente_id
    ).first()

    if conflitto_paziente:
        raise HTTPException(status_code=400, detail="Il paziente ha già una visita a quest'ora! 🚫")
    # 3. SALVATAGGIO (Solo se i controlli sopra passano)
    nuovo_turno = models.Turno(**turno.dict())
    db.add(nuovo_turno)
    db.commit()
    db.refresh(nuovo_turno)
    return nuovo_turno

@app.post("/pazienti", response_model=schemas.Paziente)
def crea_paziente(paziente: schemas.PazienteCreate, db: Session = Depends(get_db)):
    db_paziente = models.Paziente(**paziente.dict())
    db.add(db_paziente)
    db.commit()
    db.refresh(db_paziente)
    return db_paziente

@app.get("/pazienti", response_model=list[schemas.Paziente])
def leggi_pazienti(db: Session = Depends(get_db)):
    return db.query(models.Paziente).all()

@app.put("/pazienti/{paziente_id}")
def aggiorna_paziente(paziente_id: int, paziente_aggiornato: schemas.PazienteCreate, db: Session = Depends(get_db)):
    # 1. Cerchiamo il paziente nel database
    db_paziente = db.query(models.Paziente).filter(models.Paziente.id == paziente_id).first()
    
    if not db_paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")

    # 2. Sovrascriviamo i dati vecchi con quelli nuovi
    db_paziente.nome = paziente_aggiornato.nome
    db_paziente.cognome = paziente_aggiornato.cognome
    db_paziente.codice_fiscale = paziente_aggiornato.codice_fiscale
    db_paziente.email = paziente_aggiornato.email
    db_paziente.telefono = paziente_aggiornato.telefono

    # 3. Salviamo le modifiche
    db.commit()
    db.refresh(db_paziente)
    return db_paziente

@app.get("/")
async def read_index():
    return FileResponse('index.html')

# --- ROTTE PER CANCELLARE (DELETE) ---

# Cancella un Medico (Richiede Login)
@app.delete("/medici/{medico_id}")
def elimina_medico(medico_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    medico = db.query(models.Medico).filter(models.Medico.id == medico_id).first()
    if not medico:
        raise HTTPException(status_code=404, detail="Medico non trovato")
    db.delete(medico)
    db.commit()
    return {"message": "Medico eliminato"}

# Cancella un Paziente
@app.delete("/pazienti/{paziente_id}")
def elimina_paziente(paziente_id: int, db: Session = Depends(get_db)):
    paziente = db.query(models.Paziente).filter(models.Paziente.id == paziente_id).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    db.delete(paziente)
    db.commit()
    return {"message": "Paziente eliminato"}

# --- ROTTA PER SCARICARE I DATI DEI PAZIENTI ---
@app.get("/esporta-pazienti")
def esporta_pazienti(db: Session = Depends(get_db)):
    # Prende i pazienti dal database
    pazienti = db.query(models.Paziente).all()
    
    # Crea un file virtuale
    output = StringIO()
    writer = csv.writer(output)
    
    # Scrive i titoli delle colonne
    writer.writerow(["ID", "Nome", "Cognome", "Codice Fiscale", "Email", "Telefono"])
    
    # Scrive i dati dei pazienti
    for p in pazienti:
        writer.writerow([p.id, p.nome, p.cognome, p.codice_fiscale, p.email, p.telefono])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=lista_pazienti.csv"}
    )
# --- ESPORTAZIONE TURNI ---
@app.get("/esporta-turni")
def esporta_turni(db: Session = Depends(get_db)):
    # 1. Prendiamo i turni
    turni = db.query(models.Turno).all()
    
    output = StringIO()
    writer = csv.writer(output)
    
    # 2. Scriviamo i titoli delle colonne per i turni
    writer.writerow(["ID", "Orario", "Stanza", "ID Medico", "ID Paziente"])
    
    # 3. Inseriamo i dati
    for t in turni:
        writer.writerow([t.id, t.orario, t.stanza, t.medico_id, t.paziente_id])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=agenda_turni.csv"}
    )

# --- CANCELLA UN TURNO ---
@app.delete("/turni/{turno_id}")
def elimina_turno(turno_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_turno = db.query(models.Turno).filter(models.Turno.id == turno_id).first()
    
    if not db_turno:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    
    db.delete(db_turno)
    db.commit()
    return {"message": "Turno eliminato correttamente"}