from pydantic import BaseModel

# --- REGOLE PER I MEDICI ---
# Cosa mi aspetto di ricevere quando l'utente vuole aggiungere un medico
class MedicoCreate(BaseModel):
    nome: str
    cognome: str
    specializzazione: str

# Cosa il server risponderà all'utente (include l'ID generato dal database)
class MedicoResponse(MedicoCreate):
    id: int

    class Config:
        from_attributes = True

# --- REGOLE PER I TURNI ---
# Cosa mi aspetto di ricevere per un turno. 
# NOTA: Ora chiediamo il medico_id (un numero intero), non più il nome testuale!
class TurnoCreate(BaseModel):
    orario: str
    stanza: str
    medico_id: int 

# Cosa il server risponderà
class TurnoResponse(TurnoCreate):
    id: int

    class Config:
        from_attributes = True

        # --- SCHEMI PER L'AUTENTICAZIONE ---
class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str