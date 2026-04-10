# 🏥 Gestionale Clinica Aziendale

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?logo=sqlite&logoColor=white)
![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)

Un'applicazione web full-stack sviluppata per digitalizzare e semplificare la gestione del personale medico e l'assegnazione dei turni all'interno di una clinica.

🚀 **Live Demo:** [https://clinica-fastapi.onrender.com](https://clinica-fastapi.onrender.com)

> **Nota per i test:** Poiché il progetto è ospitato su un'istanza gratuita di Render, il database viene ripristinato ad ogni riavvio del server. 
> Per testare l'applicazione, visita l'endpoint `/docs`, utilizza la rotta `POST /register` per creare un utente temporaneo (es. `user` / `password123`) e utilizza quelle credenziali per accedere dal link principale.

---

## 🎯 Funzionalità Principali

* **Autenticazione Sicura:** Sistema di login e registrazione protetto, con hashing delle password.
* **Gestione Medici:** Inserimento e visualizzazione dell'anagrafica dei medici (Nome, Cognome, Specializzazione).
* **Gestione Turni:** Assegnazione dei turni ai medici specificando orario e stanza.
* **Interfaccia Intuitiva:** Frontend pulito e responsivo, progettato per un utilizzo rapido e senza frizioni.

---

## 🛠️ Stack Tecnologico

### Backend
* **Framework:** FastAPI (per la creazione di API RESTful performanti e documentazione automatica Swagger UI).
* **Database:** SQLite gestito tramite **SQLAlchemy** (ORM) per operazioni CRUD sicure e strutturate.
* **Sicurezza:** `passlib` e `bcrypt` per il salting e l'hashing sicuro delle password.

### Frontend
* **Tecnologie:** HTML5, CSS3, JavaScript (Vanilla).
* **Comunicazione:** Utilizzo dell'API asincrona `fetch` per l'integrazione fluida con le rotte del backend senza ricaricare la pagina.

### Deploy & Versioning
* **Version Control:** Git & GitHub.
* **Hosting:** Render (Pipeline di Continuous Deployment collegata al branch principale).

---

## 💡 Sfide Tecniche Affrontate (Problem Solving)

Durante lo sviluppo e la messa in produzione, ho affrontato e risolto diverse casistiche reali:

1.  **Gestione Conflitti di Dipendenze in Produzione:** Risoluzione di un `ValueError` (Errore 500) causato da incompatibilità interne tra `passlib` e le versioni più recenti di `bcrypt` in ambiente Linux. Il problema è stato risolto analizzando i log del server ed effettuando un downgrade mirato (`bcrypt==3.2.2`) nel file `requirements.txt`.
2.  **Configurazione API Frontend/Backend:** Risoluzione degli errori CORS e `ERR_CONNECTION_REFUSED` configurando correttamente le rotte JavaScript per il passaggio dall'ambiente di sviluppo locale (`localhost`) all'ambiente di produzione in cloud.
3.  **Gestione del Database Effimero:** Implementazione del comando `Base.metadata.create_all(bind=engine)` all'avvio dell'applicazione per garantire l'inizializzazione automatica delle tabelle ad ogni riavvio del container.

---

## 💻 Come avviare il progetto in locale

Se desideri scaricare ed eseguire il codice sul tuo computer, segui questi passaggi:

1. **Clona il repository:**
   ```bash
   git clone [https://github.com/](https://github.com/)[Tuo-Nome-Utente]/[Nome-Repository].git
