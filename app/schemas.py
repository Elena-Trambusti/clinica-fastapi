import re

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

STATI_VALIDI = {"prenotato", "confermato", "completato", "no_show"}


class TurnoCreate(BaseModel):
    orario: str
    stanza: str
    medico_id: int
    paziente_id: int
    stato: str = "prenotato"


class TurnoResponse(TurnoCreate):
    id: int

    model_config = {"from_attributes": True}


class TurnoStatoUpdate(BaseModel):
    stato: str


# --- AUTENTICAZIONE ---

class UserCreate(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


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
