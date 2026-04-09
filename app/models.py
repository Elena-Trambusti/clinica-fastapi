from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

# --- NUOVA TABELLA: MEDICI ---
class Medico(Base):
    __tablename__ = "medici"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String)
    cognome = Column(String)
    specializzazione = Column(String)

    # "relationship" è un trucco di SQLAlchemy.
    # Dice a Python che questo medico è collegato a molti turni.
    turni = relationship("Turno", back_populates="medico_assegnato")


# --- TABELLA AGGIORNATA: TURNI ---
class Turno(Base):
    __tablename__ = "turni"

    id = Column(Integer, primary_key=True, index=True)
    orario = Column(String)
    stanza = Column(String)

    # LA MAGIA: Questa è la Foreign Key.
    # Impedisce di inserire un turno per un Medico che non esiste!
    medico_id = Column(Integer, ForeignKey("medici.id"))

    # Relazione speculare: permette a Python di estrarre facilmente i dati del medico partendo dal turno
    medico_assegnato = relationship("Medico", back_populates="turni")

    # --- NUOVA TABELLA: UTENTI (PER IL LOGIN) ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String) # Qui salviamo la versione criptata!