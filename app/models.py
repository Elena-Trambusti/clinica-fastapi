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


class Turno(Base):
    __tablename__ = "turni"

    id = Column(Integer, primary_key=True, index=True)
    orario = Column(String, nullable=False)
    stanza = Column(String, nullable=False)
    medico_id = Column(Integer, ForeignKey("medici.id"), nullable=False)
    paziente_id = Column(Integer, ForeignKey("pazienti.id"), nullable=False)
    stato = Column(String, default="prenotato", server_default="prenotato")

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


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
