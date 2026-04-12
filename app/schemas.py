import re
from typing import Any

from pydantic import BaseModel, EmailStr, field_validator


# --- MEDICI ---

class MedicoCreate(BaseModel):
    nome: str
    cognome: str
    specializzazione: str


class MedicoResponse(MedicoCreate):
    id: int

    model_config = {"from_attributes": True}


# --- TURNI ---

STATI_VALIDI = {"prenotato", "confermato", "arrivato", "con_medico", "completato", "no_show"}


class TurnoCreate(BaseModel):
    orario: str
    stanza: str
    medico_id: int
    paziente_id: int
    stato: str = "prenotato"


class TurnoResponse(TurnoCreate):
    id: int
    orario_arrivo: str | None = None

    model_config = {"from_attributes": True}


class TurnoStatoUpdate(BaseModel):
    stato: str


class SalaAttesaEntry(BaseModel):
    turno_id: int
    paziente_id: int
    nome_paziente: str
    cognome_paziente: str
    medico_id: int
    nome_medico: str
    orario_appuntamento: str
    orario_arrivo: str
    stanza: str
    stato: str   # arrivato | con_medico


RUOLI_VALIDI = {"admin", "medico", "segreteria"}

# --- AUTENTICAZIONE ---

class UserCreate(BaseModel):
    username: str
    password: str
    ruolo: str = "admin"


class UserResponse(BaseModel):
    id: int
    username: str
    ruolo: str = "admin"

    model_config = {"from_attributes": True}


class UserMeResponse(BaseModel):
    id: int
    username: str
    ruolo: str


class Token(BaseModel):
    access_token: str
    token_type: str


# --- PAZIENTI ---

_CF_REGEX = re.compile(
    r"^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$", re.IGNORECASE
)


class PazienteBase(BaseModel):
    nome: str
    cognome: str
    codice_fiscale: str
    email: EmailStr
    telefono: str

    @field_validator("codice_fiscale")
    @classmethod
    def valida_codice_fiscale(cls, v: str) -> str:
        valore = v.strip().upper()
        if not _CF_REGEX.match(valore):
            raise ValueError("Codice fiscale non valido (formato atteso: RSSMRA80A01H501U)")
        return valore

    @field_validator("nome", "cognome")
    @classmethod
    def non_vuoto(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Il campo non puo' essere vuoto")
        return v


class PazienteCreate(PazienteBase):
    pass


class Paziente(PazienteBase):
    id: int

    model_config = {"from_attributes": True}


# --- VISITE (CARTELLA CLINICA) ---

class VisitaCreate(BaseModel):
    paziente_id: int
    medico_id: int
    data_visita: str
    motivo: str = ""
    diagnosi: str = ""
    trattamento: str = ""
    note: str = ""


class VisitaResponse(BaseModel):
    id: int
    paziente_id: int
    medico_id: int
    data_visita: str
    motivo: str
    diagnosi: str
    trattamento: str
    note: str
    nome_medico: str = ""

    model_config = {"from_attributes": True}


# --- ANAMNESI ---

GRUPPI_SANGUIGNI = {"A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-", ""}
GRAVITA_ALLERGIA = {"lieve", "moderata", "grave"}


class AnamnesiCreate(BaseModel):
    gruppo_sanguigno: str = ""
    allergie: list[dict[str, Any]] = []          # [{"nome": "...", "gravita": "grave"}]
    patologie_croniche: list[str] = []            # ["Diabete tipo 2", ...]
    farmaci_in_corso: list[dict[str, Any]] = []   # [{"nome": "...", "dosaggio": "..."}]
    contatto_emergenza_nome: str = ""
    contatto_emergenza_tel: str = ""
    contatto_emergenza_relazione: str = ""
    note_anamnestiche: str = ""


class AnamnesiResponse(BaseModel):
    id: int
    paziente_id: int
    gruppo_sanguigno: str
    allergie: list[dict[str, Any]]
    patologie_croniche: list[str]
    farmaci_in_corso: list[dict[str, Any]]
    contatto_emergenza_nome: str
    contatto_emergenza_tel: str
    contatto_emergenza_relazione: str
    note_anamnestiche: str

    model_config = {"from_attributes": True}


# --- LISTA D'ATTESA ---

STATI_ATTESA    = {"attesa", "contattato", "confermato", "rimosso"}
PRIORITA_VALIDE = {1, 2, 3}


class ListaAttesaCreate(BaseModel):
    paziente_id: int
    medico_id: int | None = None
    specializzazione: str = ""
    priorita: int = 3
    note: str = ""
    data_inserimento: str   # ISO datetime string


class ListaAttesaResponse(BaseModel):
    id: int
    paziente_id: int
    medico_id: int | None
    specializzazione: str
    priorita: int
    note: str
    data_inserimento: str
    stato: str
    nome_paziente: str = ""
    cognome_paziente: str = ""
    email_paziente: str = ""
    nome_medico: str = ""

    model_config = {"from_attributes": True}


class ListaAttesaStatoUpdate(BaseModel):
    stato: str
