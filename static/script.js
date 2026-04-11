function mostraNotifica(messaggio, successo = true) {
    const toastElement = document.getElementById('liveToast');
    const toastBody = document.getElementById('toast-body');
    
    toastElement.classList.remove('bg-success', 'bg-danger');
    toastElement.classList.add(successo ? 'bg-success' : 'bg-danger');
    
    toastBody.innerText = messaggio;
    
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}
        let token = localStorage.getItem('token'); // Recupera il pass digitale salvato

async function eliminaRecord(tipo, id) {
    if (!confirm("Sei sicura di voler eliminare questo record?")) return;

    const token = localStorage.getItem('token');
    const res = await fetch(`/${tipo}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
        mostraNotifica("Eliminato con successo! 🗑️");
        caricaDati(); // Questo ricarica le tabelle aggiornate
    } else {
        mostraNotifica("Errore durante l'eliminazione ❌", false);
    }
}

        // Funzione per mostrare l'App o il Login
        function aggiornaInterfaccia() {
            if (token) {
                document.getElementById('sezione-login').style.display = 'none';
                document.getElementById('sezione-app').style.display = 'block';
                caricaDati();
            } else {
                document.getElementById('sezione-login').style.display = 'block';
                document.getElementById('sezione-app').style.display = 'none';
            }
        }

        // --- LOGIN ---
        async function faiLogin(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('username', document.getElementById('user').value);
            formData.append('password', document.getElementById('pass').value);

            const res = await fetch('/login', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                token = data.access_token;
                localStorage.setItem('token', token); // Salva il token nel browser
                aggiornaInterfaccia();
            } else {
                mostraNotifica("Accesso negato! Credenziali errate.", false);
            }
        }

        function logout() {
            localStorage.removeItem('token');
            location.reload();
        }
        async function aggiungiMedico(event) {
    event.preventDefault();
    const dati = {
        nome: document.getElementById('nome-medico').value,
        cognome: document.getElementById('cognome-medico').value,
        specializzazione: document.getElementById('spec-medico').value
    };

    const token = localStorage.getItem('token'); // Recupera il permesso per scrivere

    const res = await fetch('/medici/', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Medico registrato con successo! 🩺");
        caricaDati(); // Ricarica la tabella dei medici
        event.target.reset(); // Svuota i campi del modulo
    } else {
        mostraNotifica("Errore nella registrazione del medico ❌", false);
    }
}

        // --- CARICAMENTO DATI (Con il Token!) ---
        async function caricaDati() {
            const headers = { 'Authorization': `Bearer ${token}` };
            
            // Carica Medici
            const resM = await fetch('/medici/', { headers });
            const medici = await resM.json();
            const tbodyM = document.getElementById('tabella-medici');
            const select = document.getElementById('id-medico-turno');
            tbodyM.innerHTML = ''; select.innerHTML = '<option value="" disabled selected>Seleziona Medico...</option>';
            
            medici.forEach(m => {  
tbodyM.innerHTML += `<tr>
    <td>${m.id}</td>
    <td>${m.nome} ${m.cognome}</td>
    <td>
        <button class="btn btn-outline-danger btn-sm" onclick="eliminaRecord('medici', ${m.id})">
            🗑️
        </button>
    </td>
</tr>`;
                select.innerHTML += `<option value="${m.id}">Dott. ${m.nome} ${m.cognome}</option>`;
            });

            // Carica Turni
            const resT = await fetch('/turni/', { headers });
            const turni = await resT.json();
            const tbodyT = document.getElementById('tabella-turni');
            tbodyT.innerHTML = '';
            turni.forEach(t => {
                tbodyT.innerHTML += `<tr><td>${t.orario}</td><td>${t.stanza}</td><td>ID Medico: ${t.medico_id}</td><td>ID Paziente: ${t.paziente_id}</td></tr>`;
            });
        }

        // Altre funzioni di aggiunta... (omesse per brevità, ma simili a prima aggiungendo headers)

        aggiornaInterfaccia();
        caricaPazienti();

async function caricaPazienti() {
    const res = await fetch('/pazienti');
    const pazienti = await res.json();
    
    const tbody = document.getElementById('tabella-pazienti');
    const selectPaz = document.getElementById('id-paziente-turno'); // Trova la tendina
    
    tbody.innerHTML = '';
    if(selectPaz) selectPaz.innerHTML = '<option value="" disabled selected>Seleziona Paziente...</option>';
    
    pazienti.forEach(p => {
        // Disegna la riga in tabella
        // Cerca il punto simile per i pazienti e usa questo:
tbody.innerHTML += `<tr>
            <td>${p.nome} ${p.cognome}</td>
            <td>${p.codice_fiscale}</td>
            <td>
                <button class="btn btn-outline-warning btn-sm me-1" onclick="preparaModifica(${p.id}, '${p.nome}', '${p.cognome}', '${p.codice_fiscale}', '${p.email}', '${p.telefono}')">✏️</button>
                
                <button class="btn btn-outline-danger btn-sm" onclick="eliminaRecord('pazienti', ${p.id})">🗑️</button>
            </td>
        </tr>`;
        // Aggiunge il nome alla tendina
        if(selectPaz) selectPaz.innerHTML += `<option value="${p.id}">${p.nome} ${p.cognome}</option>`;
    });
}

async function aggiungiTurno(e) {
    e.preventDefault();
    const dati = {
        orario: document.getElementById('orario-turno').value,
        stanza: document.getElementById('stanza-turno').value,
        medico_id: document.getElementById('id-medico-turno').value,
        paziente_id: document.getElementById('id-paziente-turno').value
    };
    
    // Recupera il pass per poter scrivere nel database
    const token = localStorage.getItem('token'); 
    
    // 1. Salviamo la risposta in una variabile 'res'
    const res = await fetch('/turni/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(dati)
    });

    // 2. Controlliamo se è andata bene
    if (res.ok) {
        mostraNotifica("Turno assegnato con successo! 📅");
        caricaDati(); // Aggiorna le tabelle
        e.target.reset(); // Svuota il modulo
    } else {
        // 1. Python ci ha mandato un errore. Dobbiamo "leggere" il messaggio.
        // Usiamo 'await res.json()' per estrarre il testo dell'errore.
        const rispostaErrore = await res.json();

        // 2. Ora mostriamo il motivo preciso (rispostaErrore.detail)
        // Se Python ha scritto "Stanza occupata", apparirà quello!
        mostraNotifica(rispostaErrore.detail || "Errore generico ❌", false);
    }
}

async function aggiungiPaziente(e) {
    e.preventDefault();
    const dati = {
        nome: document.getElementById('nome-paziente').value,
        cognome: document.getElementById('cognome-paziente').value,
        codice_fiscale: document.getElementById('cf-paziente').value,
        email: document.getElementById('email-paziente').value,
        telefono: document.getElementById('tel-paziente').value
    };
    const res = await fetch('/pazienti', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dati)
});

if (res.ok) {
    mostraNotifica("Paziente registrato con successo! ✅");
    caricaPazienti();
    e.target.reset();
} else {
    mostraNotifica("Errore nella registrazione del paziente ❌", false);
}
}
function scaricaCSV() {
    window.location.href = "/esporta-pazienti";
}
function scaricaCSVTurni() {
    // Chiama la rotta specifica per i turni
    window.location.href = "/esporta-turni";
}
function filtraPazienti() {
    // 1. Prendiamo quello che l'utente ha scritto e trasformiamolo in minuscolo
    let input = document.getElementById("cercaPaziente").value.toLowerCase();
    
    // 2. Troviamo la tabella e tutte le sue righe
    let tabella = document.getElementById("tabella-pazienti");
    let righe = tabella.getElementsByTagName("tr");

    // 3. Cicliamo tra le righe e nascondiamo quelle che non corrispondono
    for (let i = 0; i < righe.length; i++) {
        let testoRiga = righe[i].innerText.toLowerCase();
        
        if (testoRiga.includes(input)) {
            righe[i].style.display = ""; // Mostra la riga
        } else {
            righe[i].style.display = "none"; // Nascondi la riga
        }
    }
}
function filtraMedici() {
    let input = document.getElementById("cercaMedico").value.toLowerCase();
    let tabella = document.getElementById("tabella-medici");
    let righe = tabella.getElementsByTagName("tr");

    for (let i = 0; i < righe.length; i++) {
        let testoRiga = righe[i].innerText.toLowerCase();
        
        if (testoRiga.includes(input)) {
            righe[i].style.display = ""; // Mostra la riga
        } else {
            righe[i].style.display = "none"; // Nascondi la riga
        }
    }
}
// 1. Funzione per aprire il modal e riempire i campi
async function preparaModifica(id, nome, cognome, cf, email, tel) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-nome').value = nome;
    document.getElementById('edit-cognome').value = cognome;
    document.getElementById('edit-cf').value = cf;
    document.getElementById('edit-email').value = email;
    document.getElementById('edit-tel').value = tel;

    // Mostra il modal (usando Bootstrap)
    const modal = new bootstrap.Modal(document.getElementById('modalModifica'));
    modal.show();
}

// 2. Funzione per inviare la modifica al server
document.getElementById('formModificaPaziente').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const dati = {
        nome: document.getElementById('edit-nome').value,
        cognome: document.getElementById('edit-cognome').value,
        codice_fiscale: document.getElementById('edit-cf').value,
        email: document.getElementById('edit-email').value,
        telefono: document.getElementById('edit-tel').value
    };

    const res = await fetch(`/pazienti/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Paziente aggiornato! ✨");
        bootstrap.Modal.getInstance(document.getElementById('modalModifica')).hide();
        caricaDati(); // Ricarica la tabella
    }
};