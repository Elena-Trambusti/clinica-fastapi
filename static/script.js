// ═══════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════

function getToken() {
    return localStorage.getItem('token');
}

function authHeaders(extra = {}) {
    return { 'Authorization': `Bearer ${getToken()}`, ...extra };
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str ?? '')));
    return d.innerHTML;
}

function formatOrario(iso) {
    try {
        return new Date(iso).toLocaleString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return iso;
    }
}

function mostraNotifica(messaggio, successo = true) {
    const el = document.getElementById('liveToast');
    const body = document.getElementById('toast-body');
    el.classList.remove('bg-success', 'bg-danger');
    el.classList.add(successo ? 'bg-success' : 'bg-danger');
    body.innerText = messaggio;
    new bootstrap.Toast(el, { delay: 3500 }).show();
}

// ═══════════════════════════════════════════════════════
//  AUTENTICAZIONE
// ═══════════════════════════════════════════════════════

function aggiornaInterfaccia() {
    if (getToken()) {
        document.getElementById('sezione-login').style.display = 'none';
        document.getElementById('sezione-app').style.display = 'block';
        caricaTutto();
        // Piccolo delay per permettere al DOM di renderizzare prima di FullCalendar
        setTimeout(initCalendario, 80);
    } else {
        document.getElementById('sezione-login').style.display = 'flex';
        document.getElementById('sezione-app').style.display = 'none';
    }
}

async function faiLogin(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append('username', document.getElementById('user').value);
    fd.append('password', document.getElementById('pass').value);

    const res = await fetch('/login', { method: 'POST', body: fd });
    if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        aggiornaInterfaccia();
    } else {
        mostraNotifica('Credenziali errate. Riprova.', false);
    }
}

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

// ═══════════════════════════════════════════════════════
//  CARICAMENTO DATI
// ═══════════════════════════════════════════════════════

// Mappe globali id → oggetto per lookup nei turni
let _medicoMap = {};
let _pazienteMap = {};

async function caricaTutto() {
    await Promise.all([caricaDati(), caricaPazienti(), caricaStatistiche()]);
}

async function caricaDati() {
    const headers = authHeaders();

    // Medici
    const resM = await fetch('/medici/', { headers });
    if (!resM.ok) return;
    const medici = await resM.json();

    _medicoMap = {};
    const tbodyM = document.getElementById('tabella-medici');
    const selectM = document.getElementById('id-medico-turno');
    tbodyM.innerHTML = '';
    selectM.innerHTML = '<option value="" disabled selected>Seleziona medico...</option>';

    medici.forEach(m => {
        _medicoMap[m.id] = { nome: `${m.nome} ${m.cognome}`, spec: m.specializzazione };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-muted small">${escapeHtml(m.id)}</td>
            <td class="fw-semibold">${escapeHtml(m.nome)} ${escapeHtml(m.cognome)}</td>
            <td><span class="badge bg-info text-dark">${escapeHtml(m.specializzazione)}</span></td>
            <td>
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModificaMedico(${m.id},'${escapeHtml(m.nome)}','${escapeHtml(m.cognome)}','${escapeHtml(m.specializzazione || '')}')">
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
        opt.textContent = `Dott. ${m.nome} ${m.cognome} — ${m.specializzazione}`;
        selectM.appendChild(opt);
    });

    aggiornaLegendaCalendario(medici);

    // Turni
    const resT = await fetch('/turni/', { headers });
    if (!resT.ok) return;
    const turni = await resT.json();

    const tbodyT = document.getElementById('tabella-turni');
    tbodyT.innerHTML = '';

    turni.forEach(t => {
        const nomeMedico = _medicoMap[t.medico_id]?.nome ?? `ID ${t.medico_id}`;
        const nomePaz    = _pazienteMap[t.paziente_id]?.nome ?? `ID ${t.paziente_id}`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(formatOrario(t.orario))}</td>
            <td>${escapeHtml(t.stanza)}</td>
            <td>Dott. ${escapeHtml(nomeMedico)}</td>
            <td>${escapeHtml(nomePaz)}</td>
            <td>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaTurno(${t.id})">
                    Elimina
                </button>
            </td>`;
        tbodyT.appendChild(tr);
    });

    // Aggiorna il calendario se già inizializzato
    if (calendario) calendario.refetchEvents();
}

async function caricaPazienti() {
    const res = await fetch('/pazienti', { headers: authHeaders() });
    if (!res.ok) return;
    const pazienti = await res.json();

    _pazienteMap = {};
    const tbody = document.getElementById('tabella-pazienti');
    const selectP = document.getElementById('id-paziente-turno');
    tbody.innerHTML = '';
    if (selectP) selectP.innerHTML = '<option value="" disabled selected>Seleziona paziente...</option>';

    pazienti.forEach(p => {
        _pazienteMap[p.id] = { nome: `${p.nome} ${p.cognome}` };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="fw-semibold">${escapeHtml(p.nome)}</td>
            <td>${escapeHtml(p.cognome)}</td>
            <td><code>${escapeHtml(p.codice_fiscale)}</code></td>
            <td>${escapeHtml(p.email)}</td>
            <td>
                <button class="btn btn-primary btn-sm me-1 fw-semibold"
                    onclick="apriCartellaClinica(${p.id},'${escapeHtml(p.nome)}','${escapeHtml(p.cognome)}','${escapeHtml(p.codice_fiscale)}','${escapeHtml(p.email)}','${escapeHtml(p.telefono || '')}')">
                    Cartella
                </button>
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModifica(${p.id},'${escapeHtml(p.nome)}','${escapeHtml(p.cognome)}','${escapeHtml(p.codice_fiscale)}','${escapeHtml(p.email)}','${escapeHtml(p.telefono || '')}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaRecord('pazienti', ${p.id})">
                    Elimina
                </button>
            </td>`;
        tbody.appendChild(tr);

        if (selectP) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.nome} ${p.cognome}`;
            selectP.appendChild(opt);
        }
    });
}

async function caricaStatistiche() {
    const res = await fetch('/statistiche', { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    document.getElementById('stat-medici').innerText   = d.medici;
    document.getElementById('stat-pazienti').innerText = d.pazienti;
    document.getElementById('stat-turni').innerText    = d.turni;
}

// ═══════════════════════════════════════════════════════
//  CALENDARIO  (FullCalendar 6)
// ═══════════════════════════════════════════════════════

let calendario = null;
let _turnoSelezionatoId = null;

const _COLORS = [
    '#0d6efd','#198754','#dc3545','#fd7e14',
    '#6f42c1','#20c997','#d63384','#0dcaf0',
];

function initCalendario() {
    const el = document.getElementById('calendario-clinica');
    if (!el || calendario) return;

    calendario = new FullCalendar.Calendar(el, {
        locale: 'it',
        initialView: 'timeGridWeek',
        headerToolbar: {
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
        },
        buttonText: {
            today:    'Oggi',
            month:    'Mese',
            week:     'Settimana',
            day:      'Giorno',
        },
        slotMinTime: '07:00:00',
        slotMaxTime: '21:00:00',
        allDaySlot: false,
        nowIndicator: true,
        height: 720,
        businessHours: {
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '08:00',
            endTime:   '19:00',
        },
        slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },

        // Fonte eventi: chiama il nostro endpoint
        events: function(fetchInfo, successCb, failureCb) {
            fetch('/turni/calendario', { headers: authHeaders() })
                .then(r => r.ok ? r.json() : Promise.reject(r))
                .then(ev => successCb(ev))
                .catch(err => failureCb(err));
        },

        // Click su un evento → mostra dettaglio
        eventClick: function(info) {
            mostraDettaglioTurno(info.event);
        },

        // Click su uno slot vuoto → pre-compila il form turni e apre il tab
        dateClick: function(info) {
            // Porta nel formato "YYYY-MM-DDTHH:MM" per il campo datetime-local
            const iso = info.dateStr.slice(0, 16);
            document.getElementById('orario-turno').value = iso;
            bootstrap.Tab.getOrCreateInstance(
                document.getElementById('tab-turni')
            ).show();
            mostraNotifica(`Data pre-impostata: ${formatOrario(iso)}`, true);
        },

        // Stile evento: evidenzia lieve ombra
        eventDidMount: function(info) {
            info.el.style.borderRadius = '6px';
            info.el.style.boxShadow = '0 1px 4px rgba(0,0,0,.25)';
        },
    });

    calendario.render();
}

function aggiornaLegendaCalendario(medici) {
    const contenitore = document.getElementById('legenda-medici');
    if (!contenitore) return;
    contenitore.innerHTML = '';
    medici.forEach(m => {
        const colore = _COLORS[m.id % _COLORS.length];
        const span = document.createElement('span');
        span.className = 'd-flex align-items-center gap-1';
        span.innerHTML = `<span class="dot" style="background:${colore};width:10px;height:10px;border-radius:50%;display:inline-block"></span>
                          Dott. ${escapeHtml(m.cognome)}`;
        contenitore.appendChild(span);
    });
}

function mostraDettaglioTurno(event) {
    _turnoSelezionatoId = event.extendedProps.turno_id;

    document.getElementById('det-paziente').textContent = event.extendedProps.paziente ?? '—';
    document.getElementById('det-medico').textContent   = event.extendedProps.medico   ?? '—';
    document.getElementById('det-stanza').textContent   = event.extendedProps.stanza   ?? '—';
    document.getElementById('det-orario').textContent   = formatOrario(event.startStr);

    const header = document.getElementById('modal-det-header');
    header.style.background = event.backgroundColor ?? '#0d6efd';
    header.style.color = '#fff';
    header.querySelector('.btn-close').classList.add('btn-close-white');

    new bootstrap.Modal(document.getElementById('modalDettaglioTurno')).show();
}

async function eliminaTurnoDalCalendario() {
    if (!_turnoSelezionatoId) return;
    if (!confirm('Vuoi davvero cancellare questo appuntamento?')) return;

    const res = await fetch(`/turni/${_turnoSelezionatoId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    bootstrap.Modal.getInstance(document.getElementById('modalDettaglioTurno'))?.hide();

    if (res.ok) {
        mostraNotifica('Appuntamento eliminato.');
        caricaDati();
        caricaStatistiche();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nell'eliminazione.", false);
    }
    _turnoSelezionatoId = null;
}

// Refresh calendario quando si torna al tab (ridisegna layout correttamente)
document.addEventListener('DOMContentLoaded', () => {
    const tabCal = document.getElementById('tab-calendario');
    if (tabCal) {
        tabCal.addEventListener('shown.bs.tab', () => {
            if (calendario) {
                calendario.updateSize();
                calendario.refetchEvents();
            }
        });
    }
});

// ═══════════════════════════════════════════════════════
//  MEDICI
// ═══════════════════════════════════════════════════════

async function aggiungiMedico(event) {
    event.preventDefault();
    const dati = {
        nome: document.getElementById('nome-medico').value,
        cognome: document.getElementById('cognome-medico').value,
        specializzazione: document.getElementById('spec-medico').value,
    };

    const res = await fetch('/medici/', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati),
    });

    if (res.ok) {
        mostraNotifica('Medico registrato con successo.');
        event.target.reset();
        caricaDati();
        caricaStatistiche();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore nella registrazione del medico.', false);
    }
}

async function preparaModificaMedico(id, nome, cognome, specializzazione) {
    document.getElementById('edit-medico-id').value             = id;
    document.getElementById('edit-medico-nome').value          = nome;
    document.getElementById('edit-medico-cognome').value       = cognome;
    document.getElementById('edit-medico-specializzazione').value = specializzazione;
    new bootstrap.Modal(document.getElementById('modalModificaMedico')).show();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('formModificaMedico').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-medico-id').value;
        const dati = {
            nome: document.getElementById('edit-medico-nome').value,
            cognome: document.getElementById('edit-medico-cognome').value,
            specializzazione: document.getElementById('edit-medico-specializzazione').value,
        };
        const res = await fetch(`/medici/${id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(dati),
        });
        if (res.ok) {
            mostraNotifica('Medico aggiornato.');
            bootstrap.Modal.getInstance(document.getElementById('modalModificaMedico'))?.hide();
            caricaDati();
        } else {
            const err = await res.json().catch(() => ({}));
            mostraNotifica(err.detail || "Errore.", false);
        }
    };
});

// ═══════════════════════════════════════════════════════
//  TURNI
// ═══════════════════════════════════════════════════════

async function aggiungiTurno(e) {
    e.preventDefault();
    const dati = {
        orario:      document.getElementById('orario-turno').value,
        stanza:      document.getElementById('stanza-turno').value,
        medico_id:   parseInt(document.getElementById('id-medico-turno').value),
        paziente_id: parseInt(document.getElementById('id-paziente-turno').value),
    };

    const res = await fetch('/turni/', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati),
    });

    if (res.ok) {
        mostraNotifica('Appuntamento creato con successo.');
        e.target.reset();
        caricaDati();
        caricaStatistiche();
        // Torna al calendario per vedere l'evento appena creato
        bootstrap.Tab.getOrCreateInstance(document.getElementById('tab-calendario')).show();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nella creazione.", false);
    }
}

async function eliminaTurno(id) {
    if (!confirm('Vuoi davvero cancellare questo appuntamento?')) return;

    const res = await fetch(`/turni/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    if (res.ok) {
        mostraNotifica('Appuntamento eliminato.');
        caricaDati();
        caricaStatistiche();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore.", false);
    }
}

// ═══════════════════════════════════════════════════════
//  PAZIENTI
// ═══════════════════════════════════════════════════════

async function aggiungiPaziente(e) {
    e.preventDefault();
    const dati = {
        nome:           document.getElementById('nome-paziente').value,
        cognome:        document.getElementById('cognome-paziente').value,
        codice_fiscale: document.getElementById('cf-paziente').value,
        email:          document.getElementById('email-paziente').value,
        telefono:       document.getElementById('tel-paziente').value,
    };

    const res = await fetch('/pazienti', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati),
    });

    if (res.ok) {
        mostraNotifica('Paziente registrato con successo.');
        e.target.reset();
        caricaPazienti();
        caricaStatistiche();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore nella registrazione.', false);
    }
}

async function preparaModifica(id, nome, cognome, cf, email, tel) {
    document.getElementById('edit-id').value      = id;
    document.getElementById('edit-nome').value    = nome;
    document.getElementById('edit-cognome').value = cognome;
    document.getElementById('edit-cf').value      = cf;
    document.getElementById('edit-email').value   = email;
    document.getElementById('edit-tel').value     = tel;
    new bootstrap.Modal(document.getElementById('modalModifica')).show();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('formModificaPaziente').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const dati = {
            nome:           document.getElementById('edit-nome').value,
            cognome:        document.getElementById('edit-cognome').value,
            codice_fiscale: document.getElementById('edit-cf').value,
            email:          document.getElementById('edit-email').value,
            telefono:       document.getElementById('edit-tel').value,
        };
        const res = await fetch(`/pazienti/${id}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(dati),
        });
        if (res.ok) {
            mostraNotifica('Paziente aggiornato.');
            bootstrap.Modal.getInstance(document.getElementById('modalModifica'))?.hide();
            caricaPazienti();
        } else {
            const err = await res.json().catch(() => ({}));
            mostraNotifica(err.detail || "Errore.", false);
        }
    };
});

// ═══════════════════════════════════════════════════════
//  ELIMINA GENERICO
// ═══════════════════════════════════════════════════════

async function eliminaRecord(tipo, id) {
    if (!confirm(`Sei sicura di voler eliminare questo record?`)) return;

    const res = await fetch(`/${tipo}/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    if (res.ok) {
        mostraNotifica('Eliminato con successo.');
        caricaDati();
        caricaPazienti();
        caricaStatistiche();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore durante l'eliminazione.", false);
    }
}

// ═══════════════════════════════════════════════════════
//  FILTRI
// ═══════════════════════════════════════════════════════

function filtraPazienti() {
    const q = document.getElementById('cercaPaziente').value.toLowerCase();
    for (const tr of document.getElementById('tabella-pazienti').rows) {
        tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none';
    }
}

function filtraMedici() {
    const q = document.getElementById('cercaMedico').value.toLowerCase();
    for (const tr of document.getElementById('tabella-medici').rows) {
        tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none';
    }
}

// ═══════════════════════════════════════════════════════
//  EXPORT CSV
// ═══════════════════════════════════════════════════════

async function scaricaCSV() {
    const res = await fetch('/esporta-pazienti', { headers: authHeaders() });
    if (!res.ok) { mostraNotifica('Errore nel download.', false); return; }
    _downloadBlob(await res.blob(), 'lista_pazienti.csv');
}

async function scaricaCSVTurni() {
    const res = await fetch('/esporta-turni', { headers: authHeaders() });
    if (!res.ok) { mostraNotifica('Errore nel download.', false); return; }
    _downloadBlob(await res.blob(), 'agenda_turni.csv');
}

function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════
//  CARTELLA CLINICA
// ═══════════════════════════════════════════════════════

let _pazienteCartellaId = null;

function apriCartellaClinica(id, nome, cognome, cf, email, tel) {
    _pazienteCartellaId = id;

    document.getElementById('cartella-nome-paziente').textContent = `${nome} ${cognome}`;
    document.getElementById('cartella-cf').textContent    = cf;
    document.getElementById('cartella-email').textContent = email;
    document.getElementById('cartella-tel').textContent   = tel || '—';

    // Pre-imposta il paziente nel form di aggiunta visita
    document.getElementById('visita-paziente-id').value = id;

    // Popola select medici nel form visita
    _popolaSelectMediciVisita('visita-medico-id');
    _popolaSelectMediciVisita('mod-visita-medico-id');

    // Resetta il form
    document.getElementById('formAggiungiVisita').reset();
    document.getElementById('visita-paziente-id').value = id;

    // Chiude il collapse del form se era aperto
    const collapseEl = document.getElementById('formNuovaVisita');
    bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).hide();

    // Apre il modal
    new bootstrap.Modal(document.getElementById('modalCartella')).show();

    // Carica le visite
    caricaVisite(id);
}

function _popolaSelectMediciVisita(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const valoreAttuale = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Seleziona medico...</option>';
    Object.entries(_medicoMap).forEach(([id, m]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `Dott. ${m.nome} — ${m.spec}`;
        sel.appendChild(opt);
    });
    if (valoreAttuale) sel.value = valoreAttuale;
}

async function caricaVisite(pazienteId) {
    const timeline = document.getElementById('cartella-timeline');
    timeline.innerHTML = '<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Caricamento...</div>';

    const res = await fetch(`/pazienti/${pazienteId}/visite`, { headers: authHeaders() });
    if (!res.ok) {
        timeline.innerHTML = '<div class="visita-vuota"><div>Errore nel caricamento.</div></div>';
        return;
    }
    const visite = await res.json();

    const titolo = document.getElementById('cartella-titolo-storico');
    titolo.textContent = visite.length === 0
        ? 'Storico Visite'
        : `Storico Visite (${visite.length})`;

    if (visite.length === 0) {
        timeline.innerHTML = `
            <div class="visita-vuota">
                <div style="font-size:2.5rem">📋</div>
                <div class="mt-2">Nessuna visita registrata per questo paziente.</div>
                <div class="small mt-1">Clicca su "+ Aggiungi Visita" per inserire la prima.</div>
            </div>`;
        return;
    }

    timeline.innerHTML = '';
    visite.forEach(v => {
        timeline.appendChild(_creaCardVisita(v));
    });
}

function _creaCardVisita(v) {
    const card = document.createElement('div');
    card.className = 'visita-card';
    card.dataset.id = v.id;

    const dataFormatted = formatOrario(v.data_visita);

    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
                <span class="badge bg-primary me-2">${dataFormatted}</span>
                <span class="fw-semibold text-dark">${escapeHtml(v.nome_medico)}</span>
            </div>
            <div class="d-flex gap-1">
                <button class="btn btn-outline-warning btn-sm"
                    onclick="apriModificaVisita(${v.id},${v.paziente_id},${v.medico_id},'${v.data_visita}',
                        '${escapeHtml(v.motivo)}','${escapeHtml(v.diagnosi)}','${escapeHtml(v.trattamento)}','${escapeHtml(v.note)}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaVisita(${v.id})">
                    Elimina
                </button>
            </div>
        </div>
        ${v.motivo     ? `<div class="mb-1"><div class="visita-label">Motivo</div><div>${escapeHtml(v.motivo)}</div></div>` : ''}
        ${v.diagnosi   ? `<div class="mb-1"><div class="visita-label">Diagnosi</div><div>${escapeHtml(v.diagnosi)}</div></div>` : ''}
        ${v.trattamento? `<div class="mb-1"><div class="visita-label">Trattamento</div><div>${escapeHtml(v.trattamento)}</div></div>` : ''}
        ${v.note       ? `<div class="mb-0"><div class="visita-label">Note</div><div class="text-muted fst-italic">${escapeHtml(v.note)}</div></div>` : ''}
    `;
    return card;
}

async function inviaVisita(e) {
    e.preventDefault();
    const dati = {
        paziente_id: parseInt(document.getElementById('visita-paziente-id').value),
        medico_id:   parseInt(document.getElementById('visita-medico-id').value),
        data_visita: document.getElementById('visita-data').value,
        motivo:      document.getElementById('visita-motivo').value,
        diagnosi:    document.getElementById('visita-diagnosi').value,
        trattamento: document.getElementById('visita-trattamento').value,
        note:        document.getElementById('visita-note').value,
    };

    const res = await fetch('/visite/', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati),
    });

    if (res.ok) {
        mostraNotifica('Visita registrata con successo.');
        document.getElementById('formAggiungiVisita').reset();
        document.getElementById('visita-paziente-id').value = _pazienteCartellaId;
        bootstrap.Collapse.getOrCreateInstance(
            document.getElementById('formNuovaVisita'), { toggle: false }
        ).hide();
        caricaVisite(_pazienteCartellaId);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore nel salvataggio.', false);
    }
}

function apriModificaVisita(id, pazId, medId, data, motivo, diagnosi, trattamento, note) {
    document.getElementById('mod-visita-id').value          = id;
    document.getElementById('mod-visita-paziente-id').value = pazId;
    document.getElementById('mod-visita-data').value        = data.slice(0, 16);
    document.getElementById('mod-visita-motivo').value      = motivo;
    document.getElementById('mod-visita-diagnosi').value    = diagnosi;
    document.getElementById('mod-visita-trattamento').value = trattamento;
    document.getElementById('mod-visita-note').value        = note;

    _popolaSelectMediciVisita('mod-visita-medico-id');
    document.getElementById('mod-visita-medico-id').value = medId;

    new bootstrap.Modal(document.getElementById('modalModificaVisita')).show();
}

async function salvaModificaVisita() {
    const id = document.getElementById('mod-visita-id').value;
    const dati = {
        paziente_id: parseInt(document.getElementById('mod-visita-paziente-id').value),
        medico_id:   parseInt(document.getElementById('mod-visita-medico-id').value),
        data_visita: document.getElementById('mod-visita-data').value,
        motivo:      document.getElementById('mod-visita-motivo').value,
        diagnosi:    document.getElementById('mod-visita-diagnosi').value,
        trattamento: document.getElementById('mod-visita-trattamento').value,
        note:        document.getElementById('mod-visita-note').value,
    };

    const res = await fetch(`/visite/${id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(dati),
    });

    if (res.ok) {
        mostraNotifica('Visita aggiornata.');
        bootstrap.Modal.getInstance(document.getElementById('modalModificaVisita'))?.hide();
        caricaVisite(_pazienteCartellaId);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore.', false);
    }
}

async function eliminaVisita(id) {
    if (!confirm('Vuoi eliminare questa visita dalla cartella clinica?')) return;

    const res = await fetch(`/visite/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    if (res.ok) {
        mostraNotifica('Visita eliminata.');
        caricaVisite(_pazienteCartellaId);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore.', false);
    }
}

// ═══════════════════════════════════════════════════════
//  AVVIO
// ═══════════════════════════════════════════════════════

aggiornaInterfaccia();
