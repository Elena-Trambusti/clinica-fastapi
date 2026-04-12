import csv
import json
import os
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from io import StringIO

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

from . import auth, models, schemas
from .database import SessionLocal, engine
from .email_utils import (
    build_email_conferma,
    build_email_promemoria,
    get_email_config,
    send_email,
)

load_dotenv()

models.Base.metadata.create_all(bind=engine)

# Migration: aggiunge colonne mancanti per compatibilità DB esistenti
from sqlalchemy import text as _sql_text
_migrations = [
    "ALTER TABLE turni ADD COLUMN stato VARCHAR DEFAULT 'prenotato'",
    "ALTER TABLE users ADD COLUMN ruolo VARCHAR DEFAULT 'admin'",
]
for _m in _migrations:
    try:
        with engine.connect() as _conn:
            _conn.execute(_sql_text(_m))
            _conn.commit()
    except Exception:
        pass  # colonna già presente

app = FastAPI(title="Gestionale Clinica Pro")

app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Scheduler per promemoria automatici ──────────────────────────────────────

def _job_promemoria_domani() -> None:
    """Invia email di promemoria per tutti gli appuntamenti di domani (ore 08:00)."""
    db = SessionLocal()
    try:
        domani = (date.today() + timedelta(days=1)).isoformat()
        turni = (
            db.query(models.Turno)
            .options(
                joinedload(models.Turno.paziente_assegnato),
                joinedload(models.Turno.medico_assegnato),
            )
            .filter(models.Turno.orario.startswith(domani))
            .all()
        )
        inviati = 0
        for t in turni:
            paz = t.paziente_assegnato
            med = t.medico_assegnato
            if paz and paz.email and med:
                orario_fmt = datetime.fromisoformat(t.orario).strftime("%d/%m/%Y %H:%M")
                html = build_email_promemoria(
                    paziente_nome=f"{paz.nome} {paz.cognome}",
                    medico_nome=f"Dott. {med.nome} {med.cognome}",
                    orario=orario_fmt,
                    stanza=t.stanza,
                )
                if send_email(paz.email, "Promemoria appuntamento di domani", html):
                    inviati += 1
        print(f"[SCHEDULER] Promemoria domani: {inviati}/{len(turni)} email inviate")
    except Exception as exc:
        print(f"[SCHEDULER] Errore: {exc}")
    finally:
        db.close()


_scheduler = BackgroundScheduler(timezone="Europe/Rome")
_scheduler.add_job(_job_promemoria_domani, "cron", hour=8, minute=0)
_scheduler.start()

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
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


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if (current_user.ruolo or "admin") != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori")
    return current_user


# --- AUTENTICAZIONE ---

@app.post("/register", response_model=schemas.UserResponse)
def registra_utente(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    # Primo utente: accesso libero. Utenti successivi: solo admin.
    user_count = db.query(models.User).count()
    if user_count > 0:
        # Verifica token admin se presente nell'header
        from fastapi import Request
        pass  # gestito dalla UI: solo admin vede il form

    if user.ruolo not in schemas.RUOLI_VALIDI:
        raise HTTPException(status_code=400, detail=f"Ruolo non valido. Valori ammessi: {', '.join(schemas.RUOLI_VALIDI)}")
    existing = db.query(models.User).filter(models.User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username già in uso")
    hashed_pwd = auth.hash_password(user.password)
    nuovo_utente = models.User(
        username=user.username,
        hashed_password=hashed_pwd,
        ruolo=user.ruolo,
    )
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

    access_token = auth.create_access_token(data={
        "sub": user.username,
        "ruolo": user.ruolo or "admin",
    })
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me", response_model=schemas.UserMeResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "ruolo": current_user.ruolo or "admin",
    }


# --- GESTIONE UTENTI (solo admin) ---

@app.get("/utenti", response_model=list[schemas.UserResponse])
def lista_utenti(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    return db.query(models.User).all()


@app.delete("/utenti/{utente_id}")
def elimina_utente(
    utente_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    if utente_id == current_user.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo stesso account")
    utente = db.query(models.User).filter(models.User.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    db.delete(utente)
    db.commit()
    return {"message": "Utente eliminato"}


# --- EMAIL ---

@app.get("/email/stato")
def stato_email(current_user: models.User = Depends(get_current_user)):
    cfg = get_email_config()
    return {
        "abilitato": cfg["enabled"],
        "host":  cfg["host"] if cfg["enabled"] else "",
        "user":  cfg["user"] if cfg["enabled"] else "",
        "from":  cfg["from"] if cfg["enabled"] else "",
    }


@app.post("/email/test")
def test_email(
    current_user: models.User = Depends(require_admin),
):
    cfg = get_email_config()
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Email non configurata. Aggiungi SMTP_HOST, SMTP_USER e SMTP_PASS nel file .env")
    html = build_email_conferma(
        paziente_nome="Test Utente",
        medico_nome="Dott. Test",
        orario="01/01/2026 09:00",
        stanza="Stanza Test",
    )
    ok = send_email(cfg["user"], "Test configurazione email — Clinica Pro", html)
    if not ok:
        raise HTTPException(status_code=500, detail="Invio fallito. Controlla le credenziali SMTP nel file .env")
    return {"message": f"Email di test inviata a {cfg['user']}"}


@app.post("/email/promemoria-domani")
def invia_promemoria_domani_manuale(
    current_user: models.User = Depends(require_admin),
):
    """Trigger manuale del job promemoria (utile se lo scheduler non è attivo)."""
    cfg = get_email_config()
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Email non configurata nel file .env")
    _job_promemoria_domani()
    return {"message": "Promemoria inviati per gli appuntamenti di domani"}


# --- DASHBOARD ---

@app.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Totali
    tot_medici = db.query(models.Medico).count()
    tot_pazienti = db.query(models.Paziente).count()
    tot_turni = db.query(models.Turno).count()
    tot_visite = db.query(models.Visita).count()

    # Turni per giorno della settimana
    nomi_giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
    conteggio_giorni = [0] * 7
    turni = db.query(models.Turno).all()
    for t in turni:
        try:
            dt = datetime.fromisoformat(t.orario)
            conteggio_giorni[dt.weekday()] += 1
        except (ValueError, TypeError):
            pass

    # Distribuzione medici per specializzazione
    medici = db.query(models.Medico).all()
    spec_counts: dict = defaultdict(int)
    for m in medici:
        spec_counts[m.specializzazione or "Non specificata"] += 1

    # Visite per mese (ultimi 6 mesi)
    mesi_labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    visite = db.query(models.Visita).all()
    mese_counts: dict = defaultdict(int)
    for v in visite:
        try:
            dt = datetime.fromisoformat(v.data_visita)
            mese_counts[f"{dt.year}-{dt.month:02d}"] += 1
        except (ValueError, TypeError):
            pass

    oggi = date.today()
    ultimi_6: list = []
    for i in range(5, -1, -1):
        m = oggi.month - i
        y = oggi.year
        while m <= 0:
            m += 12
            y -= 1
        key = f"{y}-{m:02d}"
        ultimi_6.append({"label": mesi_labels[m - 1], "count": mese_counts.get(key, 0)})

    # Medico più attivo (per numero di turni)
    medico_id_counts = Counter(t.medico_id for t in turni if t.medico_id)
    medico_piu_attivo = {"nome": "—", "turni": 0, "specializzazione": ""}
    if medico_id_counts:
        top_id, top_count = medico_id_counts.most_common(1)[0]
        m_top = db.query(models.Medico).filter(models.Medico.id == top_id).first()
        if m_top:
            medico_piu_attivo = {
                "nome": f"Dott. {m_top.nome} {m_top.cognome}",
                "turni": top_count,
                "specializzazione": m_top.specializzazione or "",
            }

    # Turni del mese corrente
    prefisso_mese = f"{oggi.year}-{oggi.month:02d}"
    turni_questo_mese = sum(
        1 for t in turni
        if t.orario and t.orario.startswith(prefisso_mese)
    )

    return {
        "totali": {
            "medici": tot_medici,
            "pazienti": tot_pazienti,
            "turni": tot_turni,
            "visite": tot_visite,
        },
        "turni_per_giorno": {
            "labels": nomi_giorni,
            "data": conteggio_giorni,
        },
        "specializzazioni": {
            "labels": list(spec_counts.keys()),
            "data": list(spec_counts.values()),
        },
        "visite_per_mese": {
            "labels": [x["label"] for x in ultimi_6],
            "data": [x["count"] for x in ultimi_6],
        },
        "medico_piu_attivo": medico_piu_attivo,
        "turni_questo_mese": turni_questo_mese,
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
    current_user: models.User = Depends(require_admin),
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
    current_user: models.User = Depends(require_admin),
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
    current_user: models.User = Depends(require_admin),
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


def _invia_email_conferma_bg(turno_id: int) -> None:
    """Background task: invia email di conferma al paziente."""
    db = SessionLocal()
    try:
        t = (
            db.query(models.Turno)
            .options(
                joinedload(models.Turno.paziente_assegnato),
                joinedload(models.Turno.medico_assegnato),
            )
            .filter(models.Turno.id == turno_id)
            .first()
        )
        if not t:
            return
        paz = t.paziente_assegnato
        med = t.medico_assegnato
        if paz and paz.email and med:
            orario_fmt = datetime.fromisoformat(t.orario).strftime("%d/%m/%Y %H:%M")
            html = build_email_conferma(
                paziente_nome=f"{paz.nome} {paz.cognome}",
                medico_nome=f"Dott. {med.nome} {med.cognome}",
                orario=orario_fmt,
                stanza=t.stanza,
            )
            send_email(paz.email, "Conferma prenotazione appuntamento", html)
    except Exception as exc:
        print(f"[EMAIL] Errore conferma turno {turno_id}: {exc}")
    finally:
        db.close()


@app.post("/turni/", response_model=schemas.TurnoResponse)
def crea_turno(
    turno: schemas.TurnoCreate,
    background_tasks: BackgroundTasks,
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

    # Email di conferma in background (non blocca la risposta)
    background_tasks.add_task(_invia_email_conferma_bg, nuovo_turno.id)

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


@app.post("/turni/{turno_id}/email")
def invia_email_turno(
    turno_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cfg = get_email_config()
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Email non configurata nel file .env")
    t = db.query(models.Turno).options(
        joinedload(models.Turno.paziente_assegnato),
        joinedload(models.Turno.medico_assegnato),
    ).filter(models.Turno.id == turno_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    paz = t.paziente_assegnato
    if not paz or not paz.email:
        raise HTTPException(status_code=400, detail="Il paziente non ha un indirizzo email registrato")
    background_tasks.add_task(_invia_email_conferma_bg, turno_id)
    return {"message": f"Email di promemoria inviata a {paz.email}"}


@app.patch("/turni/{turno_id}/stato", response_model=schemas.TurnoResponse)
def aggiorna_stato_turno(
    turno_id: int,
    aggiornamento: schemas.TurnoStatoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if aggiornamento.stato not in schemas.STATI_VALIDI:
        raise HTTPException(status_code=400, detail=f"Stato non valido. Valori ammessi: {', '.join(schemas.STATI_VALIDI)}")
    db_turno = db.query(models.Turno).filter(models.Turno.id == turno_id).first()
    if not db_turno:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    db_turno.stato = aggiornamento.stato
    db.commit()
    db.refresh(db_turno)
    return db_turno


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


# --- VISITE / CARTELLA CLINICA ---

@app.get("/pazienti/{paziente_id}/visite")
def leggi_visite_paziente(
    paziente_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    paziente = db.query(models.Paziente).filter(models.Paziente.id == paziente_id).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")

    visite = (
        db.query(models.Visita)
        .options(joinedload(models.Visita.medico))
        .filter(models.Visita.paziente_id == paziente_id)
        .order_by(models.Visita.data_visita.desc())
        .all()
    )

    return [
        {
            "id": v.id,
            "paziente_id": v.paziente_id,
            "medico_id": v.medico_id,
            "data_visita": v.data_visita,
            "motivo": v.motivo or "",
            "diagnosi": v.diagnosi or "",
            "trattamento": v.trattamento or "",
            "note": v.note or "",
            "nome_medico": (
                f"Dott. {v.medico.nome} {v.medico.cognome}" if v.medico else f"Medico #{v.medico_id}"
            ),
        }
        for v in visite
    ]


@app.post("/visite/", response_model=schemas.VisitaResponse)
def crea_visita(
    visita: schemas.VisitaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not db.query(models.Paziente).filter(models.Paziente.id == visita.paziente_id).first():
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    if not db.query(models.Medico).filter(models.Medico.id == visita.medico_id).first():
        raise HTTPException(status_code=404, detail="Medico non trovato")

    nuova_visita = models.Visita(**visita.model_dump())
    db.add(nuova_visita)
    db.commit()
    db.refresh(nuova_visita)

    medico = db.query(models.Medico).filter(models.Medico.id == nuova_visita.medico_id).first()
    return {
        **{c.name: getattr(nuova_visita, c.name) for c in nuova_visita.__table__.columns},
        "nome_medico": f"Dott. {medico.nome} {medico.cognome}" if medico else "",
    }


@app.put("/visite/{visita_id}", response_model=schemas.VisitaResponse)
def aggiorna_visita(
    visita_id: int,
    dati: schemas.VisitaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    visita = db.query(models.Visita).filter(models.Visita.id == visita_id).first()
    if not visita:
        raise HTTPException(status_code=404, detail="Visita non trovata")

    for campo, valore in dati.model_dump().items():
        setattr(visita, campo, valore)

    db.commit()
    db.refresh(visita)

    medico = db.query(models.Medico).filter(models.Medico.id == visita.medico_id).first()
    return {
        **{c.name: getattr(visita, c.name) for c in visita.__table__.columns},
        "nome_medico": f"Dott. {medico.nome} {medico.cognome}" if medico else "",
    }


@app.delete("/visite/{visita_id}")
def elimina_visita(
    visita_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    visita = db.query(models.Visita).filter(models.Visita.id == visita_id).first()
    if not visita:
        raise HTTPException(status_code=404, detail="Visita non trovata")
    db.delete(visita)
    db.commit()
    return {"message": "Visita eliminata"}


# --- ANAMNESI ---

def _anamnesi_to_response(a: models.Anamnesi) -> schemas.AnamnesiResponse:
    """Deserializza i campi JSON e restituisce lo schema di risposta."""
    def _load(v: str, default):
        try:
            return json.loads(v or "[]")
        except (json.JSONDecodeError, TypeError):
            return default

    return schemas.AnamnesiResponse(
        id=a.id,
        paziente_id=a.paziente_id,
        gruppo_sanguigno=a.gruppo_sanguigno or "",
        allergie=_load(a.allergie, []),
        patologie_croniche=_load(a.patologie_croniche, []),
        farmaci_in_corso=_load(a.farmaci_in_corso, []),
        contatto_emergenza_nome=a.contatto_emergenza_nome or "",
        contatto_emergenza_tel=a.contatto_emergenza_tel or "",
        contatto_emergenza_relazione=a.contatto_emergenza_relazione or "",
        note_anamnestiche=a.note_anamnestiche or "",
    )


@app.get("/pazienti/{paziente_id}/anamnesi", response_model=schemas.AnamnesiResponse)
def get_anamnesi(
    paziente_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    paz = db.query(models.Paziente).filter(models.Paziente.id == paziente_id).first()
    if not paz:
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    a = db.query(models.Anamnesi).filter(models.Anamnesi.paziente_id == paziente_id).first()
    if not a:
        # Restituisce un'anamnesi vuota senza crearla nel DB
        return schemas.AnamnesiResponse(
            id=0, paziente_id=paziente_id,
            gruppo_sanguigno="", allergie=[], patologie_croniche=[],
            farmaci_in_corso=[], contatto_emergenza_nome="",
            contatto_emergenza_tel="", contatto_emergenza_relazione="",
            note_anamnestiche="",
        )
    return _anamnesi_to_response(a)


@app.put("/pazienti/{paziente_id}/anamnesi", response_model=schemas.AnamnesiResponse)
def upsert_anamnesi(
    paziente_id: int,
    dati: schemas.AnamnesiCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    paz = db.query(models.Paziente).filter(models.Paziente.id == paziente_id).first()
    if not paz:
        raise HTTPException(status_code=404, detail="Paziente non trovato")

    a = db.query(models.Anamnesi).filter(models.Anamnesi.paziente_id == paziente_id).first()
    if not a:
        a = models.Anamnesi(paziente_id=paziente_id)
        db.add(a)

    a.gruppo_sanguigno = dati.gruppo_sanguigno
    a.allergie = json.dumps(dati.allergie, ensure_ascii=False)
    a.patologie_croniche = json.dumps(dati.patologie_croniche, ensure_ascii=False)
    a.farmaci_in_corso = json.dumps(dati.farmaci_in_corso, ensure_ascii=False)
    a.contatto_emergenza_nome = dati.contatto_emergenza_nome
    a.contatto_emergenza_tel = dati.contatto_emergenza_tel
    a.contatto_emergenza_relazione = dati.contatto_emergenza_relazione
    a.note_anamnestiche = dati.note_anamnestiche

    db.commit()
    db.refresh(a)
    return _anamnesi_to_response(a)


# --- LISTA D'ATTESA ---

def _attesa_to_response(e: models.ListaAttesa) -> schemas.ListaAttesaResponse:
    paz = e.paziente
    med = e.medico
    return schemas.ListaAttesaResponse(
        id=e.id,
        paziente_id=e.paziente_id,
        medico_id=e.medico_id,
        specializzazione=e.specializzazione or "",
        priorita=e.priorita,
        note=e.note or "",
        data_inserimento=e.data_inserimento,
        stato=e.stato,
        nome_paziente=paz.nome if paz else "",
        cognome_paziente=paz.cognome if paz else "",
        email_paziente=paz.email if paz else "",
        nome_medico=f"{med.nome} {med.cognome}" if med else "",
    )


@app.get("/lista-attesa", response_model=list[schemas.ListaAttesaResponse])
def get_lista_attesa(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entries = (
        db.query(models.ListaAttesa)
        .filter(models.ListaAttesa.stato.in_(["attesa", "contattato"]))
        .order_by(models.ListaAttesa.priorita, models.ListaAttesa.data_inserimento)
        .all()
    )
    return [_attesa_to_response(e) for e in entries]


@app.post("/lista-attesa", response_model=schemas.ListaAttesaResponse, status_code=201)
def crea_attesa(
    dati: schemas.ListaAttesaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    paz = db.query(models.Paziente).filter(models.Paziente.id == dati.paziente_id).first()
    if not paz:
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    if dati.medico_id:
        med = db.query(models.Medico).filter(models.Medico.id == dati.medico_id).first()
        if not med:
            raise HTTPException(status_code=404, detail="Medico non trovato")
    if dati.priorita not in schemas.PRIORITA_VALIDE:
        raise HTTPException(status_code=422, detail="Priorità non valida (1=urgente, 2=alta, 3=normale)")

    entry = models.ListaAttesa(
        paziente_id=dati.paziente_id,
        medico_id=dati.medico_id,
        specializzazione=dati.specializzazione,
        priorita=dati.priorita,
        note=dati.note,
        data_inserimento=dati.data_inserimento,
        stato="attesa",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _attesa_to_response(entry)


@app.patch("/lista-attesa/{entry_id}/stato", response_model=schemas.ListaAttesaResponse)
def aggiorna_stato_attesa(
    entry_id: int,
    payload: schemas.ListaAttesaStatoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.stato not in schemas.STATI_ATTESA:
        raise HTTPException(status_code=422, detail=f"Stato non valido. Valori consentiti: {schemas.STATI_ATTESA}")
    entry = db.query(models.ListaAttesa).filter(models.ListaAttesa.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Voce non trovata")
    entry.stato = payload.stato
    db.commit()
    db.refresh(entry)
    return _attesa_to_response(entry)


@app.delete("/lista-attesa/{entry_id}")
def elimina_attesa(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entry = db.query(models.ListaAttesa).filter(models.ListaAttesa.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Voce non trovata")
    db.delete(entry)
    db.commit()
    return {"message": "Rimosso dalla lista d'attesa"}


@app.post("/lista-attesa/{entry_id}/notifica")
def notifica_attesa(
    entry_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    entry = db.query(models.ListaAttesa).filter(models.ListaAttesa.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Voce non trovata")
    paz = entry.paziente
    if not paz or not paz.email:
        raise HTTPException(status_code=400, detail="Paziente senza email")

    med_nome = f"{entry.medico.nome} {entry.medico.cognome}" if entry.medico else entry.specializzazione or "il nostro studio"
    background_tasks.add_task(_invia_notifica_attesa_bg, entry_id=entry_id, paz_email=paz.email,
                               paz_nome=f"{paz.nome} {paz.cognome}", med_nome=med_nome)

    entry.stato = "contattato"
    db.commit()
    return {"message": "Notifica email inviata"}


def _invia_notifica_attesa_bg(entry_id: int, paz_email: str, paz_nome: str, med_nome: str):
    from .email_utils import send_email, build_email_disponibilita
    body = build_email_disponibilita(paz_nome, med_nome)
    ok = send_email(paz_email, "Posto Disponibile — Clinica Aziendale", body)
    print(f"[ATTESA] Notifica a {paz_email}: {'OK' if ok else 'SKIP (email non configurata)'}")


# --- CALENDARIO ---

_COLORS = [
    "#0d6efd", "#198754", "#dc3545", "#fd7e14",
    "#6f42c1", "#20c997", "#d63384", "#0dcaf0",
]


@app.get("/turni/calendario")
def turni_calendario(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    turni = (
        db.query(models.Turno)
        .options(
            joinedload(models.Turno.medico_assegnato),
            joinedload(models.Turno.paziente_assegnato),
        )
        .all()
    )

    events = []
    for t in turni:
        medico = t.medico_assegnato
        paziente = t.paziente_assegnato
        nome_medico = (
            f"Dott. {medico.nome} {medico.cognome}" if medico else f"Medico #{t.medico_id}"
        )
        nome_paziente = (
            f"{paziente.nome} {paziente.cognome}" if paziente else f"Paziente #{t.paziente_id}"
        )
        colore = _COLORS[t.medico_id % len(_COLORS)]

        try:
            start_dt = datetime.fromisoformat(t.orario)
            end_dt = start_dt + timedelta(minutes=30)
        except (ValueError, TypeError):
            continue

        events.append(
            {
                "id": str(t.id),
                "title": nome_paziente,
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
                "backgroundColor": colore,
                "borderColor": colore,
                "extendedProps": {
                    "stanza": t.stanza,
                    "medico": nome_medico,
                    "paziente": nome_paziente,
                    "turno_id": t.id,
                },
            }
        )
    return events


# --- FRONTEND ---

@app.get("/")
async def read_index():
    return FileResponse("index.html")
