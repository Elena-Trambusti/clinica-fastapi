# Gestionale Clinica Aziendale

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?logo=sqlite&logoColor=white)
![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)

Un'applicazione web full-stack per digitalizzare e semplificare la gestione del personale medico, dei pazienti e dei turni all'interno di una clinica.

**Live Demo:** [https://clinica-fastapi.onrender.com](https://clinica-fastapi.onrender.com)

> **Nota per i test:** Il progetto è ospitato su un'istanza gratuita di Render. Il database viene ripristinato ad ogni riavvio del server.
> Per testare l'applicazione, visita l'endpoint `/docs`, utilizza la rotta `POST /register` per creare un utente (es. `user` / `password123`) e accedi con quelle credenziali dalla home.

---

## Funzionalità

- **Autenticazione JWT:** Login e registrazione con hashing sicuro delle password (bcrypt).
- **Gestione Medici:** Inserimento, modifica ed eliminazione dell'anagrafica medici.
- **Gestione Pazienti:** CRUD completo con validazione di email e codice fiscale.
- **Gestione Turni:** Assegnazione dei turni con controllo automatico dei conflitti (medico, stanza, paziente).
- **Esportazione CSV:** Download protetto della lista pazienti e dell'agenda turni.
- **Dashboard:** Statistiche in tempo reale su medici, pazienti e turni attivi.

---

## Stack Tecnologico

### Backend
- **Framework:** FastAPI — API RESTful con documentazione Swagger UI automatica.
- **Database:** SQLite gestito tramite SQLAlchemy ORM.
- **Sicurezza:** `passlib` + `bcrypt` per l'hashing delle password; `python-jose` per i token JWT.
- **Validazione:** Pydantic v2 con validazione di `EmailStr` e codice fiscale italiano.

### Frontend
- **Tecnologie:** HTML5, CSS3, JavaScript (Vanilla) con Bootstrap 5.
- **Comunicazione:** API `fetch` asincrona con token JWT negli header `Authorization`.

### Deploy
- **Hosting:** Render (CD collegata al branch `main`).
- **Versioning:** Git & GitHub.

---

## Sfide Tecniche Affrontate

1. **Conflitti di dipendenze in produzione:** `passlib` non è compatibile con le versioni più recenti di `bcrypt` su Linux. Risolto con `bcrypt==3.2.2` nel `requirements.txt`.
2. **CORS e ambienti multipli:** Gestione degli origini consentiti tramite variabile d'ambiente `ALLOWED_ORIGINS`, separando development e production senza modificare il codice.
3. **Database effimero su Render:** `Base.metadata.create_all()` all'avvio garantisce la ricostruzione automatica delle tabelle ad ogni riavvio del container.

---

## Avvio in Locale

### Prerequisiti
- Python 3.11+
- pip

### Installazione

```bash
# 1. Clona il repository
git clone https://github.com/Elena-Trambusti/clinica-fastapi.git
cd clinica-fastapi

# 2. Crea e attiva un ambiente virtuale
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 3. Installa le dipendenze
pip install -r requirements.txt

# 4. Crea il file .env con le variabili d'ambiente
# (NON committare mai questo file)
echo SECRET_KEY=genera-una-chiave-casuale-di-64-caratteri > .env
echo ALLOWED_ORIGINS=http://localhost:8000 >> .env

# 5. Avvia il server
uvicorn app.main:app --reload
```

L'applicazione sarà disponibile su [http://localhost:8000](http://localhost:8000).  
La documentazione interattiva delle API è su [http://localhost:8000/docs](http://localhost:8000/docs).

### Generare una SECRET_KEY sicura

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Struttura del Progetto

```
clinica-fastapi/
├── app/
│   ├── __init__.py
│   ├── auth.py        # Hashing password e generazione token JWT
│   ├── database.py    # Connessione SQLAlchemy
│   ├── main.py        # Route FastAPI
│   ├── models.py      # Modelli ORM (Medico, Paziente, Turno, User)
│   └── schemas.py     # Schemi Pydantic con validazione
├── static/
│   └── script.js      # Logica frontend (fetch, UI, autenticazione)
├── index.html         # Interfaccia utente
├── requirements.txt   # Dipendenze pinnate
├── .env               # Variabili d'ambiente (non nel repository)
└── .gitignore
```
