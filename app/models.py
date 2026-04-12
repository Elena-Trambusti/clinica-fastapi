from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Medico(Base):
    __tablename__ = "medici"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    cognome = Column(String, nullable=False)
    specializzazione = Column(String, nullable=False)

    turni = relationship("Turno", back_populates="medico_assegnato")
    visite = relationship("Visita", back_populates="medico")
    prescrizioni = relationship("Prescrizione", back_populates="medico")


class Paziente(Base):
    __tablename__ = "pazienti"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    cognome = Column(String, nullable=False)
    codice_fiscale = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=False)
    telefono = Column(String)

    turni = relationship("Turno", back_populates="paziente_assegnato")
    visite = relationship("Visita", back_populates="paziente")
    anamnesi = relationship("Anamnesi", back_populates="paziente", uselist=False)
    prescrizioni = relationship("Prescrizione", back_populates="paziente")


class Anamnesi(Base):
    """Anamnesi medica del paziente — relazione 1:1 con Paziente."""
    __tablename__ = "anamnesi"

    id = Column(Integer, primary_key=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), unique=True, nullable=False)

    gruppo_sanguigno = Column(String, default="")          # es. "A+", "0-"
    # JSON text: [{"nome": "Penicillina", "gravita": "grave"}]
    allergie = Column(Text, default="[]")
    # JSON text: ["Diabete tipo 2", "Ipertensione arteriosa"]
    patologie_croniche = Column(Text, default="[]")
    # JSON text: [{"nome": "Metformina", "dosaggio": "500mg 2x/die"}]
    farmaci_in_corso = Column(Text, default="[]")
    contatto_emergenza_nome = Column(String, default="")
    contatto_emergenza_tel = Column(String, default="")
    contatto_emergenza_relazione = Column(String, default="")  # Coniuge, Genitore…
    note_anamnestiche = Column(Text, default="")

    paziente = relationship("Paziente", back_populates="anamnesi")


class Turno(Base):
    __tablename__ = "turni"

    id = Column(Integer, primary_key=True, index=True)
    orario = Column(String, nullable=False)
    stanza = Column(String, nullable=False)
    medico_id = Column(Integer, ForeignKey("medici.id"), nullable=False)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), nullable=False)
    stato = Column(String, default="prenotato", server_default="prenotato")
    orario_arrivo = Column(String, nullable=True)   # timestamp ISO check-in fisico

    medico_assegnato = relationship("Medico", back_populates="turni")
    paziente_assegnato = relationship("Paziente", back_populates="turni")


class Visita(Base):
    __tablename__ = "visite"

    id = Column(Integer, primary_key=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), nullable=False)
    medico_id = Column(Integer, ForeignKey("medici.id"), nullable=False)
    data_visita = Column(String, nullable=False)
    motivo = Column(String, default="")
    diagnosi = Column(String, default="")
    trattamento = Column(String, default="")
    note = Column(Text, default="")

    paziente = relationship("Paziente", back_populates="visite")
    medico = relationship("Medico", back_populates="visite")


class Prescrizione(Base):
    """Prescrizione farmaceutica digitale (PDF generato lato client)."""
    __tablename__ = "prescrizioni"

    id = Column(Integer, primary_key=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), nullable=False)
    medico_id = Column(Integer, ForeignKey("medici.id"), nullable=False)
    data_prescrizione = Column(String, nullable=False)
    # JSON: [{"nome": "...", "posologia": "...", "durata": "7 gg", "qty": "1 scatola"}]
    farmaci = Column(Text, default="[]")
    diagnosi_riferimento = Column(String, default="")
    note_prescrittore = Column(Text, default="")

    paziente = relationship("Paziente", back_populates="prescrizioni")
    medico = relationship("Medico", back_populates="prescrizioni")


class ListaAttesa(Base):
    """Coda d'attesa per specialità mediche."""
    __tablename__ = "lista_attesa"

    id = Column(Integer, primary_key=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), nullable=False)
    medico_id   = Column(Integer, ForeignKey("medici.id"), nullable=True)   # facoltativo
    specializzazione = Column(String, default="")   # filtro alternativo al medico specifico
    priorita    = Column(Integer, default=3)         # 1=urgente 2=alta 3=normale
    note        = Column(Text, default="")
    data_inserimento = Column(String, nullable=False)
    stato       = Column(String, default="attesa", server_default="attesa")
    # attesa | contattato | confermato | rimosso

    paziente = relationship("Paziente", backref="lista_attesa")
    medico   = relationship("Medico",   backref="lista_attesa")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    ruolo = Column(String, default="admin", server_default="admin")
