// --- UTILITY ---

function getToken() {
    return localStorage.getItem('token');
}

function authHeaders(extraHeaders = {}) {
    return {
        'Authorization': `Bearer ${getToken()}`,
        ...extraHeaders
    };
}

function mostraNotifica(messaggio, successo = true) {
    const toastElement = document.getElementById('liveToast');
    const toastBody = document.getElementById('toast-body');

    toastElement.classList.remove('bg-success', 'bg-danger');
    toastElement.classList.add(successo ? 'bg-success' : 'bg-danger');

    toastBody.innerText = messaggio;

    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

function escapeHtml(testo) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(testo));
    return div.innerHTML;
}

// --- INTERFACCIA ---

function aggiornaInterfaccia() {
    const token = getToken();
    if (token) {
        document.getElementById('sezione-login').style.display = 'none';
        document.getElementById('sezione-app').style.display = 'block';
        caricaDati();
        caricaPazienti();
        caricaStatistiche();
    } else {
        document.getElementById('sezione-login').style.display = 'block';
        document.getElementById('sezione-app').style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('token');
    location.reload();
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
        localStorage.setItem('token', data.access_token);
        aggiornaInterfaccia();
    } else {
        mostraNotifica("Accesso negato: credenziali errate.", false);
    }
}

// --- ELIMINA GENERICO (medici e pazienti) ---

async function eliminaRecord(tipo, id) {
    if (!confirm("Sei sicura di voler eliminare questo record?")) return;

    const res = await fetch(`/${tipo}/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });

    if (res.ok) {
        mostraNotifica("Eliminato con successo.");
        caricaDati();
        caricaPazienti();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore durante l'eliminazione.", false);
    }
}

// --- MEDICI ---

async function aggiungiMedico(event) {
    event.preventDefault();
    const dati = {
        nome: document.getElementById('nome-medico').value,
        cognome: document.getElementById('cognome-medico').value,
        specializzazione: document.getElementById('spec-medico').value
    };

    const res = await fetch('/medici/', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Medico registrato con successo.");
        caricaDati();
        event.target.reset();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nella registrazione del medico.", false);
    }
}

// --- TURNI ---

async function aggiungiTurno(e) {
    e.preventDefault();
    const dati = {
        orario: document.getElementById('orario-turno').value,
        stanza: document.getElementById('stanza-turno').value,
        medico_id: parseInt(document.getElementById('id-medico-turno').value),
        paziente_id: parseInt(document.getElementById('id-paziente-turno').value)
    };

    const res = await fetch('/turni/', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Turno assegnato con successo.");
        caricaDati();
        e.target.reset();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nell'assegnazione del turno.", false);
    }
}

async function eliminaTurno(id) {
    if (!confirm("Vuoi davvero cancellare questo appuntamento?")) return;

    const res = await fetch(`/turni/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });

    if (res.ok) {
        mostraNotifica("Appuntamento rimosso.");
        caricaDati();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nella cancellazione.", false);
    }
}

// --- PAZIENTI ---

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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Paziente registrato con successo.");
        caricaPazienti();
        e.target.reset();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nella registrazione del paziente.", false);
    }
}

// --- CARICAMENTO DATI ---

async function caricaDati() {
    const headers = authHeaders();

    // Carica Medici
    const resM = await fetch('/medici/', { headers });
    if (!resM.ok) return;
    const medici = await resM.json();

    const tbodyM = document.getElementById('tabella-medici');
    const select = document.getElementById('id-medico-turno');
    tbodyM.innerHTML = '';
    select.innerHTML = '<option value="" disabled selected>Seleziona Medico...</option>';

    medici.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(String(m.id))}</td>
            <td>${escapeHtml(m.nome)} ${escapeHtml(m.cognome)}</td>
            <td>${escapeHtml(m.specializzazione)}</td>
            <td>
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModificaMedico(${m.id}, '${escapeHtml(m.nome)}', '${escapeHtml(m.cognome)}', '${escapeHtml(m.specializzazione || '')}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaRecord('medici', ${m.id})">
                    Elimina
                </button>
            </td>`;
        tbodyM.appendChild(tr);

        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `Dott. ${m.nome} ${m.cognome}`;
        select.appendChild(opt);
    });

    // Carica Turni
    const resT = await fetch('/turni/', { headers });
    if (!resT.ok) return;
    const turni = await resT.json();

    const tbodyT = document.getElementById('tabella-turni');
    tbodyT.innerHTML = '';

    turni.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(t.orario)}</td>
            <td>${escapeHtml(t.stanza)}</td>
            <td>${escapeHtml(String(t.medico_id))}</td>
            <td>${escapeHtml(String(t.paziente_id))}</td>
            <td>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaTurno(${t.id})">
                    Elimina
                </button>
            </td>`;
        tbodyT.appendChild(tr);
    });
}

async function caricaPazienti() {
    const res = await fetch('/pazienti', { headers: authHeaders() });
    if (!res.ok) return;
    const pazienti = await res.json();

    const tbody = document.getElementById('tabella-pazienti');
    const selectPaz = document.getElementById('id-paziente-turno');

    tbody.innerHTML = '';
    if (selectPaz) {
        selectPaz.innerHTML = '<option value="" disabled selected>Seleziona Paziente...</option>';
    }

    pazienti.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(p.nome)} ${escapeHtml(p.cognome)}</td>
            <td>${escapeHtml(p.codice_fiscale)}</td>
            <td>
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModifica(${p.id}, '${escapeHtml(p.nome)}', '${escapeHtml(p.cognome)}', '${escapeHtml(p.codice_fiscale)}', '${escapeHtml(p.email)}', '${escapeHtml(p.telefono)}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaRecord('pazienti', ${p.id})">
                    Elimina
                </button>
            </td>`;
        tbody.appendChild(tr);

        if (selectPaz) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.nome} ${p.cognome}`;
            selectPaz.appendChild(opt);
        }
    });
}

// --- STATISTICHE ---

async function caricaStatistiche() {
    const res = await fetch('/statistiche', { headers: authHeaders() });
    if (!res.ok) return;
    const dati = await res.json();
    document.getElementById('stat-medici').innerText = dati.medici;
    document.getElementById('stat-pazienti').innerText = dati.pazienti;
    document.getElementById('stat-turni').innerText = dati.turni;
}

// --- FILTRI ---

function filtraPazienti() {
    const input = document.getElementById("cercaPaziente").value.toLowerCase();
    const righe = document.getElementById("tabella-pazienti").getElementsByTagName("tr");
    for (const riga of righe) {
        riga.style.display = riga.innerText.toLowerCase().includes(input) ? "" : "none";
    }
}

function filtraMedici() {
    const input = document.getElementById("cercaMedico").value.toLowerCase();
    const righe = document.getElementById("tabella-medici").getElementsByTagName("tr");
    for (const riga of righe) {
        riga.style.display = riga.innerText.toLowerCase().includes(input) ? "" : "none";
    }
}

// --- MODIFICA PAZIENTE ---

async function preparaModifica(id, nome, cognome, cf, email, tel) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-nome').value = nome;
    document.getElementById('edit-cognome').value = cognome;
    document.getElementById('edit-cf').value = cf;
    document.getElementById('edit-email').value = email;
    document.getElementById('edit-tel').value = tel;
    new bootstrap.Modal(document.getElementById('modalModifica')).show();
}

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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Paziente aggiornato.");
        bootstrap.Modal.getInstance(document.getElementById('modalModifica')).hide();
        caricaPazienti();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nell'aggiornamento.", false);
    }
};

// --- MODIFICA MEDICO ---

async function preparaModificaMedico(id, nome, cognome, specializzazione) {
    document.getElementById('edit-medico-id').value = id;
    document.getElementById('edit-medico-nome').value = nome;
    document.getElementById('edit-medico-cognome').value = cognome;
    document.getElementById('edit-medico-specializzazione').value = specializzazione;
    new bootstrap.Modal(document.getElementById('modalModificaMedico')).show();
}

document.getElementById('formModificaMedico').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-medico-id').value;
    const dati = {
        nome: document.getElementById('edit-medico-nome').value,
        cognome: document.getElementById('edit-medico-cognome').value,
        specializzazione: document.getElementById('edit-medico-specializzazione').value
    };

    const res = await fetch(`/medici/${id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati)
    });

    if (res.ok) {
        mostraNotifica("Medico aggiornato con successo.");
        bootstrap.Modal.getInstance(document.getElementById('modalModificaMedico')).hide();
        caricaDati();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nell'aggiornamento.", false);
    }
};

// --- ESPORTAZIONE CSV (con token) ---

async function scaricaCSV() {
    const res = await fetch('/esporta-pazienti', { headers: authHeaders() });
    if (!res.ok) {
        mostraNotifica("Errore nel download del CSV.", false);
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lista_pazienti.csv';
    a.click();
    URL.revokeObjectURL(url);
}

async function scaricaCSVTurni() {
    const res = await fetch('/esporta-turni', { headers: authHeaders() });
    if (!res.ok) {
        mostraNotifica("Errore nel download del CSV.", false);
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agenda_turni.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// --- AVVIO ---

aggiornaInterfaccia();
