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

/** Converte la risposta JSON di errore FastAPI (detail stringa o array) in testo leggibile. */
function formatApiError(err) {
    if (!err || typeof err !== 'object') return 'Richiesta non valida.';
    const d = err.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
        return d.map((e) => {
            if (typeof e === 'string') return e;
            const loc = Array.isArray(e.loc) ? e.loc.filter(Boolean).join(' › ') : '';
            const msg = e.msg || e.message || '';
            return loc ? `${loc}: ${msg}` : msg;
        }).filter(Boolean).join(' ');
    }
    if (d != null && typeof d === 'object') return JSON.stringify(d);
    return 'Errore del server.';
}

// ═══════════════════════════════════════════════════════
//  AUTENTICAZIONE
// ═══════════════════════════════════════════════════════

function aggiornaInterfaccia() {
    if (getToken()) {
        document.getElementById('sezione-login').style.display = 'none';
        document.getElementById('sezione-app').style.display = 'block';
        caricaTutto();
        inizializzaNotifiche();
    } else {
        document.getElementById('sezione-login').style.display = '';   // CSS gestisce flex
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
    if (_notificheInterval) clearInterval(_notificheInterval);
    localStorage.removeItem('token');
    location.reload();
}

// ═══════════════════════════════════════════════════════
//  NOTIFICHE
// ═══════════════════════════════════════════════════════

let _notificheInterval = null;
let _notificheInviate  = new Set();  // IDs già notificati via browser

function inizializzaNotifiche() {
    // Chiedi permesso browser notifications se non ancora deciso
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    controllaNotifiche();
    if (_notificheInterval) clearInterval(_notificheInterval);
    _notificheInterval = setInterval(controllaNotifiche, 2 * 60 * 1000); // ogni 2 min
}

async function controllaNotifiche() {
    const res = await fetch('/turni/calendario', { headers: authHeaders() });
    if (!res.ok) return;
    const eventi = await res.json();

    const ora     = new Date();
    const oggiStr = ora.toISOString().slice(0, 10);

    // Solo appuntamenti di oggi, ordinati per orario
    const oggi = eventi
        .filter(e => e.start.slice(0, 10) === oggiStr)
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    // Badge: mostra il totale degli appuntamenti di oggi
    const badge = document.getElementById('notifiche-badge');
    if (badge) {
        if (oggi.length > 0) {
            badge.textContent = oggi.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Animazione pulsante se ci sono appuntamenti urgenti (entro 30 min)
    const btn = document.getElementById('notifiche-btn');
    const haUrgenti = oggi.some(e => {
        const diff = (new Date(e.start) - ora) / 60000;
        return diff > 0 && diff <= 30;
    });
    if (btn) {
        btn.classList.toggle('ha-urgenti', haUrgenti);
    }

    // Browser notification per appuntamenti entro 15 minuti
    oggi.forEach(e => {
        const diffMin = (new Date(e.start) - ora) / 60000;
        if (diffMin > 0 && diffMin <= 15 && !_notificheInviate.has(e.id)) {
            _notificheInviate.add(e.id);
            _inviaBrowserNotifica(
                `⏰ Appuntamento tra ${Math.round(diffMin)} min`,
                `${e.extendedProps?.paziente ?? e.title} — ${e.extendedProps?.medico ?? ''} · Stanza ${e.extendedProps?.stanza ?? '—'}`
            );
        }
    });

    _renderPanelNotifiche(oggi, ora);
}

function _inviaBrowserNotifica(titolo, corpo) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(titolo, {
            body: corpo,
            icon: '/static/logo.png',
        });
    }
}

function _renderPanelNotifiche(eventi, ora) {
    const panel = document.getElementById('notifiche-panel');
    if (!panel) return;

    const dataLabel = ora.toLocaleDateString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'long',
    });

    // Separa: futuri urgenti (≤30min), futuri normali, passati
    const urgenti   = [];
    const normali   = [];
    const passati   = [];

    eventi.forEach(e => {
        const diffMin = (new Date(e.start) - ora) / 60000;
        if (diffMin < 0)        passati.push(e);
        else if (diffMin <= 30) urgenti.push(e);
        else                    normali.push(e);
    });

    let html = `
        <div class="notif-header">
            <span>📅 ${escapeHtml(dataLabel)}</span>
            <span class="badge bg-primary">${eventi.length} appt.</span>
        </div>`;

    // Suggerimento permesso browser se non ancora concesso
    if ('Notification' in window && Notification.permission === 'default') {
        html += `
        <div class="notif-permesso">
            <span>🔔 Attiva le notifiche del browser</span>
            <button class="btn btn-sm btn-warning fw-semibold py-0"
                    onclick="Notification.requestPermission()">
                Attiva
            </button>
        </div>`;
    }

    if (eventi.length === 0) {
        html += '<div class="notif-empty">✅ Nessun appuntamento programmato per oggi</div>';
        panel.innerHTML = html;
        return;
    }

    function _rigaEvento(e, cls) {
        const start   = new Date(e.start);
        const orario  = start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const diffMin = (start - ora) / 60000;
        const diffLbl = diffMin > 0 && diffMin <= 90
            ? `<span class="badge ${diffMin <= 30 ? 'bg-danger' : 'bg-warning text-dark'} ms-1">tra ${Math.round(diffMin)} min</span>`
            : '';
        const paziente = escapeHtml(e.extendedProps?.paziente ?? e.title);
        const medico   = escapeHtml(e.extendedProps?.medico ?? '—');
        const stanza   = escapeHtml(e.extendedProps?.stanza ?? '—');
        return `
        <div class="notif-item ${cls}" onclick="saltaATab('tab-calendario',null,null);toggleNotifiche()">
            <div class="notif-item-ora">${orario}${diffLbl}</div>
            <div class="notif-item-paziente">${paziente}</div>
            <div class="notif-item-sub">${medico} · Stanza ${stanza}</div>
        </div>`;
    }

    if (urgenti.length) {
        html += '<div class="notif-section-label">🔴 Imminenti (entro 30 min)</div>';
        urgenti.forEach(e => { html += _rigaEvento(e, 'notif-urgente'); });
    }
    if (normali.length) {
        html += '<div class="notif-section-label">📋 Prossimi</div>';
        normali.forEach(e => { html += _rigaEvento(e, ''); });
    }
    if (passati.length) {
        html += '<div class="notif-section-label">✓ Già effettuati</div>';
        passati.forEach(e => { html += _rigaEvento(e, 'notif-passato'); });
    }

    panel.innerHTML = html;
}

function toggleNotifiche() {
    const panel = document.getElementById('notifiche-panel');
    if (!panel) return;
    const apri = panel.style.display !== 'block';

    // Chiudi altri dropdown aperti
    const boxSearch = document.getElementById('ricerca-risultati');
    if (boxSearch) boxSearch.style.display = 'none';

    panel.style.display = apri ? 'block' : 'none';
}

// Chiudi il pannello cliccando fuori
document.addEventListener('click', e => {
    const wrap  = document.getElementById('notifiche-wrap');
    const panel = document.getElementById('notifiche-panel');
    if (panel && wrap && !wrap.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════
//  CARICAMENTO DATI
// ═══════════════════════════════════════════════════════

// Mappe globali id → oggetto per lookup nei turni
let _medicoMap = {};
let _pazienteMap = {};

// Array globali per ricerca e filtri
let _allMedici   = [];
let _allPazienti = [];
let _allTurni    = [];

// Export
let _turniVisibili       = [];   // turni dopo filtro (usato da esportaTurniPDF)
let _pazienteCartellaInfo = {};  // dati paziente aperto nella cartella clinica

// Istanze Chart.js (distrutte e ricreate ad ogni refresh dashboard)
let _charts = {};

// Ruolo e nome utente corrente
let _userRole = 'admin';
let _userName = '';

// Etichette e icone per i ruoli
const _ruoloLabel = { admin: '👑 Admin', medico: '🩺 Medico', segreteria: '📋 Segreteria' };
const _ruoloClass = { admin: 'ruolo-admin', medico: 'ruolo-medico', segreteria: 'ruolo-segreteria' };

async function _caricaMe() {
    try {
        const res = await fetch('/me', { headers: authHeaders() });
        if (!res.ok) return;
        const me = await res.json();
        _userRole = me.ruolo || 'admin';
        _userName = me.username || '';
        _applyRoleUI();
    } catch {
        // ignora
    }
}

function _applyRoleUI() {
    // Imposta data-role sul body per il CSS (mostra/nasconde .admin-only e .no-medico)
    document.body.dataset.role = _userRole;

    // Badge ruolo nella navbar
    const badge = document.getElementById('navbar-ruolo-badge');
    if (badge) {
        badge.textContent = _ruoloLabel[_userRole] || _userRole;
        badge.className = `ruolo-badge ${_ruoloClass[_userRole] || ''}`;
        badge.classList.remove('d-none');
    }
    // Nome utente nella navbar
    const usernameEl = document.getElementById('navbar-username');
    if (usernameEl) {
        usernameEl.textContent = _userName;
        usernameEl.classList.remove('d-none');
    }
}

async function caricaTutto() {
    await Promise.all([_caricaMe(), caricaDati(), caricaPazienti(), caricaDashboard()]);
}

async function caricaDati() {
    const headers = authHeaders();

    // Medici
    const resM = await fetch('/medici/', { headers });
    if (!resM.ok) return;
    const medici = await resM.json();
    _allMedici = medici;

    _medicoMap = {};
    const tbodyM = document.getElementById('tabella-medici');
    const selectM  = document.getElementById('id-medico-turno');
    const filtroM  = document.getElementById('filtro-medico');
    tbodyM.innerHTML = '';
    selectM.innerHTML = '<option value="" disabled selected>Seleziona medico...</option>';
    if (filtroM) filtroM.innerHTML = '<option value="">Tutti i medici</option>';

    medici.forEach(m => {
        _medicoMap[m.id] = { nome: `${m.nome} ${m.cognome}`, spec: m.specializzazione };

        const isAdmin = _userRole === 'admin';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-muted small">${escapeHtml(m.id)}</td>
            <td class="fw-semibold">${escapeHtml(m.nome)} ${escapeHtml(m.cognome)}</td>
            <td><span class="badge bg-info text-dark">${escapeHtml(m.specializzazione)}</span></td>
            <td>
                ${isAdmin ? `
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModificaMedico(${m.id},'${escapeHtml(m.nome)}','${escapeHtml(m.cognome)}','${escapeHtml(m.specializzazione || '')}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaRecord('medici', ${m.id})">
                    Elimina
                </button>` : '<span class="text-muted small">Sola lettura</span>'}
            </td>`;
        tbodyM.appendChild(tr);

        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `Dott. ${m.nome} ${m.cognome} — ${m.specializzazione}`;
        selectM.appendChild(opt);

        if (filtroM) {
            const fOpt = document.createElement('option');
            fOpt.value = m.id;
            fOpt.textContent = `Dott. ${m.nome} ${m.cognome}`;
            filtroM.appendChild(fOpt);
        }
    });

    aggiornaLegendaCalendario(medici);

    const cntM = document.getElementById('medici-count');
    if (cntM) cntM.textContent = `${medici.length} medici`;

    // Turni
    const resT = await fetch('/turni/', { headers });
    if (!resT.ok) return;
    _allTurni = await resT.json();

    filtraTurni();   // renderizza rispettando filtri eventualmente già attivi

    // Aggiorna il calendario se già inizializzato
    if (calendario) calendario.refetchEvents();
}

// Rendering separato dei turni — usato anche da filtraTurni()
// Mappa stato → etichetta leggibile
const _statoLabel = {
    prenotato:  '🔵 Prenotato',
    confermato: '🟢 Confermato',
    arrivato:   '🟠 In sala',
    con_medico: '🩺 Con medico',
    completato: '⚪ Completato',
    no_show:    '🔴 No-show',
};

function _buildStatoSelect(turnoId, statoCorrente) {
    const stato = statoCorrente || 'prenotato';
    const opts = Object.entries(_statoLabel).map(([val, lbl]) =>
        `<option value="${val}"${val === stato ? ' selected' : ''}>${lbl}</option>`
    ).join('');
    return `<select class="stato-select stato-${stato}"
                title="Clicca per cambiare stato"
                onchange="aggiornaStatoTurno(${turnoId}, this.value, this)">${opts}</select>`;
}

function _renderTabellaTurni(lista) {
    _turniVisibili = lista;       // aggiorna lista per export PDF
    const tbody = document.getElementById('tabella-turni');
    tbody.innerHTML = '';
    lista.forEach(t => {
        const nomeMedico = _medicoMap[t.medico_id]?.nome ?? `ID ${t.medico_id}`;
        const nomePaz    = _pazienteMap[t.paziente_id]?.nome ?? `ID ${t.paziente_id}`;
        const tr = document.createElement('tr');
        const canDeleteTurno = _userRole !== 'medico';
        const canCheckin = (t.stato === 'prenotato' || t.stato === 'confermato');
        const btnCheckin = canCheckin
            ? `<button class="btn btn-warning btn-sm" title="Paziente arrivato — Check-in"
                onclick="checkInTurno(${t.id})">🏥 Check-in</button>`
            : '';
        tr.innerHTML = `
            <td>${escapeHtml(formatOrario(t.orario))}</td>
            <td>${escapeHtml(t.stanza)}</td>
            <td>Dott. ${escapeHtml(nomeMedico)}</td>
            <td>${escapeHtml(nomePaz)}</td>
            <td>${_buildStatoSelect(t.id, t.stato)}</td>
            <td class="d-flex gap-1 flex-wrap">
                ${btnCheckin}
                <button class="btn btn-outline-primary btn-sm" title="Invia email promemoria al paziente"
                    onclick="inviaEmailTurno(${t.id})">📧</button>
                ${canDeleteTurno ? `<button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaTurno(${t.id})">Elimina</button>` : ''}
            </td>`;
        tbody.appendChild(tr);
    });

    // Aggiorna contatore risultati
    const counter = document.getElementById('turni-count');
    if (counter) {
        counter.textContent = lista.length === _allTurni.length
            ? `${lista.length} appuntamenti`
            : `${lista.length} di ${_allTurni.length}`;
    }
}

async function aggiornaStatoTurno(id, nuovoStato, selectEl) {
    try {
        const res = await fetch(`/turni/${id}/stato`, {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ stato: nuovoStato }),
        });
        if (!res.ok) {
            mostraNotifica('Errore aggiornamento stato', 'danger');
            return;
        }
        // Aggiorna il colore del select in-place senza ricaricare tutta la tabella
        if (selectEl) {
            selectEl.className = `stato-select stato-${nuovoStato}`;
        }
        // Aggiorna l'array in memoria per export e filtri
        const turno = _allTurni.find(t => t.id === id);
        if (turno) turno.stato = nuovoStato;
        mostraNotifica(`Stato aggiornato: ${_statoLabel[nuovoStato] || nuovoStato}`, 'success');
    } catch {
        mostraNotifica('Errore di rete', 'danger');
    }
}

async function caricaPazienti() {
    const res = await fetch('/pazienti', { headers: authHeaders() });
    if (!res.ok) return;
    const pazienti = await res.json();
    _allPazienti = pazienti;

    _pazienteMap = {};
    const tbody   = document.getElementById('tabella-pazienti');
    const selectP = document.getElementById('id-paziente-turno');
    const filtroP = document.getElementById('filtro-paziente');
    tbody.innerHTML = '';
    if (selectP) selectP.innerHTML = '<option value="" disabled selected>Seleziona paziente...</option>';
    if (filtroP) filtroP.innerHTML = '<option value="">Tutti i pazienti</option>';

    pazienti.forEach(p => {
        _pazienteMap[p.id] = { nome: `${p.nome} ${p.cognome}` };

        const canEditPazienti = _userRole !== 'medico';
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
                ${canEditPazienti ? `
                <button class="btn btn-outline-warning btn-sm me-1"
                    onclick="preparaModifica(${p.id},'${escapeHtml(p.nome)}','${escapeHtml(p.cognome)}','${escapeHtml(p.codice_fiscale)}','${escapeHtml(p.email)}','${escapeHtml(p.telefono || '')}')">
                    Modifica
                </button>
                <button class="btn btn-outline-danger btn-sm"
                    onclick="eliminaRecord('pazienti', ${p.id})">
                    Elimina
                </button>` : ''}
            </td>`;
        tbody.appendChild(tr);

        if (selectP) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.nome} ${p.cognome}`;
            selectP.appendChild(opt);
        }
        if (filtroP) {
            const fOpt = document.createElement('option');
            fOpt.value = p.id;
            fOpt.textContent = `${p.nome} ${p.cognome}`;
            filtroP.appendChild(fOpt);
        }
    });

    const cntP = document.getElementById('pazienti-count');
    if (cntP) cntP.textContent = `${pazienti.length} pazienti`;
}

let _ultimoReportMensile = null;

function _initReportMensileSelectors() {
    const ySel = document.getElementById('report-anno');
    const mSel = document.getElementById('report-mese');
    if (!ySel || !mSel || ySel.dataset.inited === '1') return;
    ySel.dataset.inited = '1';
    const cy = new Date().getFullYear();
    [-1, 0, 1, 2].forEach((off) => {
        const yy = cy + off;
        const o = document.createElement('option');
        o.value = String(yy);
        o.textContent = String(yy);
        ySel.appendChild(o);
    });
    ySel.value = String(cy);
    const mesiNomi = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
    ];
    mesiNomi.forEach((nome, i) => {
        const o = document.createElement('option');
        o.value = String(i + 1);
        o.textContent = nome;
        mSel.appendChild(o);
    });
    mSel.value = String(new Date().getMonth() + 1);
}

async function caricaReportMensile() {
    _initReportMensileSelectors();
    const anno = parseInt(document.getElementById('report-anno').value, 10);
    const mese = parseInt(document.getElementById('report-mese').value, 10);
    const res = await fetch(`/report/mensile?anno=${anno}&mese=${mese}`, { headers: authHeaders() });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(formatApiError(err), false);
        return;
    }
    const r = await res.json();
    _ultimoReportMensile = r;
    document.getElementById('report-mensile-placeholder').classList.add('d-none');
    document.getElementById('report-mensile-content').classList.remove('d-none');
    document.getElementById('report-mensile-titolo').textContent = r.etichetta_mese;

    document.getElementById('report-kpi-turni').textContent = r.turni_totali;
    document.getElementById('report-kpi-noshow').textContent = `${r.tasso_no_show_pct}%`;
    document.getElementById('report-kpi-comp').textContent = `${r.tasso_completamento_pct}%`;
    document.getElementById('report-kpi-paz').textContent = r.pazienti_distinti;
    document.getElementById('report-kpi-nuovi').textContent = r.pazienti_nuovi;
    document.getElementById('report-kpi-ric').textContent = r.pazienti_ricorrenti;
    document.getElementById('report-kpi-visite').textContent = r.visite_nel_mese;

    const tbS = document.getElementById('report-tbody-stati');
    const statoEtichette = {
        prenotato: 'Prenotato',
        confermato: 'Confermato',
        arrivato: 'In sala',
        con_medico: 'Con medico',
        completato: 'Completato',
        no_show: 'No-show',
    };
    tbS.innerHTML = Object.entries(r.conteggi_stato || {}).map(([k, v]) =>
        `<tr><td>${escapeHtml(statoEtichette[k] || k)}</td><td class="text-end fw-semibold">${v}</td></tr>`).join('');

    const tbM = document.getElementById('report-tbody-medici');
    if ((r.turni_per_medico || []).length === 0) {
        tbM.innerHTML = '<tr><td colspan="2" class="text-muted fst-italic small">Nessun appuntamento nel mese</td></tr>';
    } else {
        tbM.innerHTML = r.turni_per_medico.map((row) =>
            `<tr><td>${escapeHtml(row.nome)}</td><td class="text-end">${row.count}</td></tr>`).join('');
    }

    _initReportOreChart(r);
}

function _initReportOreChart(r) {
    _destroyChart('reportOre');
    const ctx = document.getElementById('chart-report-ore');
    if (!ctx) return;
    const labels = [];
    const data = [];
    for (let h = 7; h <= 20; h++) {
        labels.push(`${String(h).padStart(2, '0')}:00`);
        const row = (r.ore_picco || []).find((x) => x.ora === h);
        data.push(row ? row.count : 0);
    }
    _charts.reportOre = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Appuntamenti',
                data,
                backgroundColor: 'rgba(220,53,69,.65)',
                borderColor: '#dc3545',
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                x: { ticks: { maxRotation: 45, font: { size: 9 } }, grid: { display: false } },
            },
        },
    });
}

function esportaReportMensilePDF() {
    if (!window.jspdf || !_ultimoReportMensile) {
        mostraNotifica(!_ultimoReportMensile ? 'Aggiorna prima il report con «Aggiorna report».' : 'Libreria PDF non caricata.', false);
        return;
    }
    const r = _ultimoReportMensile;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(111, 66, 193);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Report clinico mensile', 10, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(r.etichetta_mese, 10, 20);
    doc.text(new Date().toLocaleString('it-IT'), 200, 20, { align: 'right' });

    let y = 30;
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Appuntamenti nel mese: ${r.turni_totali}`, 10, y); y += 6;
    doc.text(`Tasso no-show: ${r.tasso_no_show_pct}%  —  Completati: ${r.tasso_completamento_pct}%`, 10, y); y += 6;
    doc.text(`Pazienti unici: ${r.pazienti_distinti} (nuovi: ${r.pazienti_nuovi}, ricorrenti: ${r.pazienti_ricorrenti})`, 10, y); y += 6;
    doc.text(`Visite registrate nel mese: ${r.visite_nel_mese}`, 10, y); y += 10;

    const statoPdf = {
        prenotato: 'Prenotato',
        confermato: 'Confermato',
        arrivato: 'In sala',
        con_medico: 'Con medico',
        completato: 'Completato',
        no_show: 'No-show',
    };
    const statiRows = Object.entries(r.conteggi_stato || {}).map(([k, v]) => [statoPdf[k] || k, String(v)]);
    doc.autoTable({
        startY: y,
        head: [['Stato', 'Numero']],
        body: statiRows,
        theme: 'striped',
        headStyles: { fillColor: [111, 66, 193] },
    });
    y = doc.lastAutoTable.finalY + 8;

    const oreBody = [];
    for (let h = 7; h <= 20; h++) {
        const row = (r.ore_picco || []).find((x) => x.ora === h);
        oreBody.push([`${String(h).padStart(2, '0')}:00`, String(row ? row.count : 0)]);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Distribuzione per ora', 10, y);
    y += 5;
    doc.autoTable({
        startY: y,
        head: [['Ora', 'Appuntamenti']],
        body: oreBody,
        theme: 'grid',
        headStyles: { fillColor: [108, 117, 125] },
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Carico per medico', 10, y);
    y += 5;
    const medBody = (r.turni_per_medico || []).map((m) => [m.nome, String(m.count)]);
    if (!medBody.length) medBody.push(['—', '0']);
    doc.autoTable({
        startY: y,
        head: [['Medico', 'Appuntamenti']],
        body: medBody,
        theme: 'striped',
        headStyles: { fillColor: [25, 135, 84] },
    });

    doc.save(`report_mensile_${r.anno}_${String(r.mese).padStart(2, '0')}.pdf`);
    mostraNotifica('PDF report scaricato.');
}

async function caricaDashboard() {
    _initReportMensileSelectors();
    const res = await fetch('/dashboard', { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();

    // KPI cards
    document.getElementById('stat-medici').innerText   = d.totali.medici;
    document.getElementById('stat-pazienti').innerText = d.totali.pazienti;
    document.getElementById('stat-turni').innerText    = d.totali.turni;
    document.getElementById('stat-visite').innerText   = d.totali.visite;

    // Medico più attivo
    document.getElementById('dash-medico-nome').innerText   = escapeHtml(d.medico_piu_attivo.nome);
    document.getElementById('dash-medico-turni').innerText  = d.medico_piu_attivo.turni;
    document.getElementById('dash-turni-mese').innerText    = d.turni_questo_mese;
    const specEl = document.getElementById('dash-medico-spec');
    if (d.medico_piu_attivo.specializzazione) {
        specEl.innerText = d.medico_piu_attivo.specializzazione;
        specEl.style.display = 'inline-block';
    } else {
        specEl.style.display = 'none';
    }

    _initGrafici(d);
}

function _destroyChart(key) {
    if (_charts[key]) {
        _charts[key].destroy();
        _charts[key] = null;
    }
}

function _initGrafici(d) {
    const palette = [
        '#0d6efd','#198754','#dc3545','#fd7e14',
        '#6f42c1','#20c997','#d63384','#0dcaf0',
    ];

    // ── Grafico 1: Turni per giorno della settimana (Bar) ──
    _destroyChart('turniGiorno');
    const ctxBar = document.getElementById('chart-turni-giorno');
    if (ctxBar) {
        _charts.turniGiorno = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: d.turni_per_giorno.labels,
                datasets: [{
                    label: 'Appuntamenti',
                    data: d.turni_per_giorno.data,
                    backgroundColor: d.turni_per_giorno.labels.map((_, i) =>
                        i === 5 || i === 6 ? 'rgba(108,117,125,.35)' : 'rgba(13,110,253,.75)'
                    ),
                    borderColor: d.turni_per_giorno.labels.map((_, i) =>
                        i === 5 || i === 6 ? '#6c757d' : '#0d6efd'
                    ),
                    borderWidth: 1.5,
                    borderRadius: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.parsed.y} appuntamenti`,
                    }},
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,.05)' },
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false },
                    },
                },
            },
        });
    }

    // ── Grafico 2: Specializzazioni (Doughnut) ──
    _destroyChart('specializzazioni');
    const ctxDough = document.getElementById('chart-specializzazioni');
    if (ctxDough) {
        const hasData = d.specializzazioni.data.length > 0;
        _charts.specializzazioni = new Chart(ctxDough, {
            type: 'doughnut',
            data: {
                labels: hasData ? d.specializzazioni.labels : ['Nessun medico'],
                datasets: [{
                    data: hasData ? d.specializzazioni.data : [1],
                    backgroundColor: hasData
                        ? d.specializzazioni.labels.map((_, i) => palette[i % palette.length])
                        : ['#dee2e6'],
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 11 }, padding: 10, boxWidth: 12 },
                    },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} medic${ctx.parsed === 1 ? 'o' : 'i'}`,
                    }},
                },
            },
        });
    }

    // ── Grafico 3: Visite per mese (Line) ──
    _destroyChart('visiteMese');
    const ctxLine = document.getElementById('chart-visite-mese');
    if (ctxLine) {
        _charts.visiteMese = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: d.visite_per_mese.labels,
                datasets: [{
                    label: 'Visite',
                    data: d.visite_per_mese.data,
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111,66,193,.12)',
                    pointBackgroundColor: '#6f42c1',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.parsed.y} visit${ctx.parsed.y === 1 ? 'a' : 'e'}`,
                    }},
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,.05)' },
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false },
                    },
                },
            },
        });
    }
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
        caricaDashboard();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || "Errore nell'eliminazione.", false);
    }
    _turnoSelezionatoId = null;
}

// Gestione tab: Calendario (lazy init + resize) e Dashboard (resize grafici)
document.addEventListener('DOMContentLoaded', () => {
    // Calendario: inizializzato la prima volta che si apre il tab
    const tabCal = document.getElementById('tab-calendario');
    if (tabCal) {
        tabCal.addEventListener('shown.bs.tab', () => {
            if (!calendario) {
                initCalendario();
            } else {
                calendario.updateSize();
                calendario.refetchEvents();
            }
        });
    }

    // Dashboard: ridimensiona i grafici Chart.js quando il tab diventa visibile
    const tabDash = document.getElementById('tab-dashboard');
    if (tabDash) {
        tabDash.addEventListener('shown.bs.tab', () => {
            Object.values(_charts).forEach(c => c && c.resize());
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
        caricaDashboard();
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
        caricaDashboard();
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
        caricaDashboard();
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
        nome:           document.getElementById('nome-paziente').value.trim(),
        cognome:        document.getElementById('cognome-paziente').value.trim(),
        codice_fiscale: document.getElementById('cf-paziente').value.trim(),
        email:          document.getElementById('email-paziente').value.trim(),
        telefono:       document.getElementById('tel-paziente').value.trim(),
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
        caricaDashboard();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(formatApiError(err), false);
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
            mostraNotifica(formatApiError(err), false);
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
        caricaDashboard();
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
    let count = 0;
    for (const tr of document.getElementById('tabella-pazienti').rows) {
        const show = tr.innerText.toLowerCase().includes(q);
        tr.style.display = show ? '' : 'none';
        if (show) count++;
    }
    const el = document.getElementById('pazienti-count');
    if (el) el.textContent = q ? `${count} di ${_allPazienti.length}` : `${_allPazienti.length} pazienti`;
}

function filtraMedici() {
    const q = document.getElementById('cercaMedico').value.toLowerCase();
    let count = 0;
    for (const tr of document.getElementById('tabella-medici').rows) {
        const show = tr.innerText.toLowerCase().includes(q);
        tr.style.display = show ? '' : 'none';
        if (show) count++;
    }
    const el = document.getElementById('medici-count');
    if (el) el.textContent = q ? `${count} di ${_allMedici.length}` : `${_allMedici.length} medici`;
}

function filtraTurni() {
    const da       = document.getElementById('filtro-da')?.value ?? '';
    const a        = document.getElementById('filtro-a')?.value ?? '';
    const medicoId = document.getElementById('filtro-medico')?.value ?? '';
    const pazId    = document.getElementById('filtro-paziente')?.value ?? '';
    const statoFil = document.getElementById('filtro-stato')?.value ?? '';
    const q        = (document.getElementById('cerca-turno')?.value ?? '').toLowerCase();

    let lista = _allTurni;

    if (da)       lista = lista.filter(t => t.orario && t.orario.slice(0, 10) >= da);
    if (a)        lista = lista.filter(t => t.orario && t.orario.slice(0, 10) <= a);
    if (medicoId) lista = lista.filter(t => String(t.medico_id) === medicoId);
    if (pazId)    lista = lista.filter(t => String(t.paziente_id) === pazId);
    if (statoFil) lista = lista.filter(t => (t.stato || 'prenotato') === statoFil);
    if (q) {
        lista = lista.filter(t => {
            const med = (_medicoMap[t.medico_id]?.nome ?? '').toLowerCase();
            const paz = (_pazienteMap[t.paziente_id]?.nome ?? '').toLowerCase();
            return med.includes(q) || paz.includes(q) || (t.stanza || '').toLowerCase().includes(q);
        });
    }

    _renderTabellaTurni(lista);

    // Aggiorna badge contatore filtri attivi
    const nFiltri = [da, a, medicoId, pazId, statoFil, q].filter(Boolean).length;
    const badge = document.getElementById('badge-filtri');
    if (badge) {
        if (nFiltri > 0) {
            badge.textContent = nFiltri;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
}

function resetFiltriTurni() {
    const ids = ['filtro-da', 'filtro-a', 'filtro-medico', 'filtro-paziente', 'filtro-stato', 'cerca-turno'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    filtraTurni();
}

// ═══════════════════════════════════════════════════════
//  RICERCA GLOBALE
// ═══════════════════════════════════════════════════════

function ricercaGlobale(q) {
    const box = document.getElementById('ricerca-risultati');
    if (!q || q.trim().length < 2) { box.style.display = 'none'; return; }
    const ql = q.toLowerCase().trim();

    const mediciMatch   = _allMedici.filter(m =>
        `${m.nome} ${m.cognome} ${m.specializzazione}`.toLowerCase().includes(ql)
    ).slice(0, 4);

    const pazMatch = _allPazienti.filter(p =>
        `${p.nome} ${p.cognome} ${p.codice_fiscale} ${p.email}`.toLowerCase().includes(ql)
    ).slice(0, 4);

    const turniMatch = _allTurni.filter(t => {
        const med = _medicoMap[t.medico_id]?.nome ?? '';
        const paz = _pazienteMap[t.paziente_id]?.nome ?? '';
        return `${med} ${paz} ${t.stanza}`.toLowerCase().includes(ql);
    }).slice(0, 3);

    if (!mediciMatch.length && !pazMatch.length && !turniMatch.length) {
        box.innerHTML = '<div class="gs-empty">Nessun risultato per "<strong>' + escapeHtml(q) + '</strong>"</div>';
        box.style.display = 'block';
        return;
    }

    let html = '';

    if (mediciMatch.length) {
        html += '<div class="gs-category">👨‍⚕️ Medici</div>';
        mediciMatch.forEach(m => {
            const nomeFull = escapeHtml(`${m.nome} ${m.cognome}`);
            html += `<div class="gs-item" onclick="saltaATab('tab-medici','cercaMedico','${nomeFull}')">
                <div class="gs-title">Dott. ${nomeFull}</div>
                <div class="gs-sub">${escapeHtml(m.specializzazione || '—')}</div>
            </div>`;
        });
    }

    if (pazMatch.length) {
        html += '<div class="gs-category">👤 Pazienti</div>';
        pazMatch.forEach(p => {
            const nomeFull = escapeHtml(`${p.nome} ${p.cognome}`);
            html += `<div class="gs-item" onclick="saltaATab('tab-pazienti','cercaPaziente','${nomeFull}')">
                <div class="gs-title">${nomeFull}</div>
                <div class="gs-sub">${escapeHtml(p.codice_fiscale)} · ${escapeHtml(p.email)}</div>
            </div>`;
        });
    }

    if (turniMatch.length) {
        html += '<div class="gs-category">📅 Appuntamenti</div>';
        turniMatch.forEach(t => {
            const med = escapeHtml(_medicoMap[t.medico_id]?.nome ?? '—');
            const paz = escapeHtml(_pazienteMap[t.paziente_id]?.nome ?? '—');
            html += `<div class="gs-item" onclick="saltaATab('tab-turni',null,null)">
                <div class="gs-title">${paz} — Dott. ${med}</div>
                <div class="gs-sub">${escapeHtml(formatOrario(t.orario))} · Stanza ${escapeHtml(t.stanza)}</div>
            </div>`;
        });
    }

    box.innerHTML = html;
    box.style.display = 'block';
}

function saltaATab(tabId, cercaId, query) {
    // Chiude il dropdown
    const box  = document.getElementById('ricerca-risultati');
    const inp  = document.getElementById('ricerca-globale');
    if (box) box.style.display = 'none';
    if (inp) inp.value = '';

    // Attiva il tab
    const tabEl = document.getElementById(tabId);
    if (tabEl) new bootstrap.Tab(tabEl).show();

    // Pre-compila la ricerca locale e applica il filtro
    if (cercaId && query) {
        setTimeout(() => {
            const el = document.getElementById(cercaId);
            if (el) {
                el.value = query;
                el.dispatchEvent(new Event('keyup'));
            }
        }, 120);
    }
}

// Chiudi ricerca globale cliccando fuori
document.addEventListener('click', e => {
    const wrap = document.getElementById('navbar-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const box = document.getElementById('ricerca-risultati');
        if (box) box.style.display = 'none';
    }
});

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
//  EXPORT PDF  (jsPDF + autoTable)
// ═══════════════════════════════════════════════════════

function _pdfHeader(doc, titolo, colore = [13, 110, 253], landscape = false) {
    const w = landscape ? 297 : 210;
    doc.setFillColor(...colore);
    doc.rect(0, 0, w, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Gestionale Clinica Pro', 10, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(titolo, w / 2, 13, { align: 'center' });
    doc.text(new Date().toLocaleDateString('it-IT'), w - 10, 13, { align: 'right' });
    doc.setTextColor(0, 0, 0);
}

function _pdfFooter(doc, landscape = false) {
    const pages = doc.getNumberOfPages();
    const w     = landscape ? 297 : 210;
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(160);
        doc.text('Documento generato automaticamente — Gestionale Clinica Pro', 10, 203);
        doc.text(`Pagina ${i} di ${pages}`, w - 10, 203, { align: 'right' });
    }
}

// ── PDF Lista Appuntamenti (usa i turni attualmente filtrati) ──
function esportaTurniPDF() {
    if (!window.jspdf) { mostraNotifica('Libreria PDF non ancora caricata.', false); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    _pdfHeader(doc, 'Lista Appuntamenti', [13, 110, 253], true);

    const body = _turniVisibili.map(t => [
        formatOrario(t.orario),
        t.stanza,
        `Dott. ${_medicoMap[t.medico_id]?.nome ?? '—'}`,
        _pazienteMap[t.paziente_id]?.nome ?? '—',
    ]);

    doc.autoTable({
        startY: 25,
        head: [['Data e Ora', 'Stanza', 'Medico', 'Paziente']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [13, 110, 253], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [240, 245, 255] },
        columnStyles: {
            0: { cellWidth: 48 },
            1: { cellWidth: 28 },
            2: { cellWidth: 80 },
            3: { cellWidth: 80 },
        },
        margin: { left: 10, right: 10 },
    });

    _pdfFooter(doc, true);

    const filtro = document.getElementById('badge-filtri')?.classList.contains('d-none') ? '' : '_filtrato';
    doc.save(`appuntamenti${filtro}_${new Date().toISOString().slice(0, 10)}.pdf`);
    mostraNotifica(`PDF generato: ${body.length} appuntamenti.`);
}

// ── PDF Registro Pazienti (usa pazienti visibili nella tabella) ──
function esportaPazientiPDF() {
    if (!window.jspdf) { mostraNotifica('Libreria PDF non ancora caricata.', false); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    _pdfHeader(doc, 'Registro Pazienti', [25, 135, 84]);

    const righeVisibili = Array.from(document.getElementById('tabella-pazienti').rows)
        .filter(tr => tr.style.display !== 'none');

    const body = righeVisibili.map(tr => {
        const celle = Array.from(tr.cells);
        return [celle[0].innerText, celle[1].innerText, celle[2].innerText, celle[3].innerText];
    });

    doc.autoTable({
        startY: 25,
        head: [['Nome', 'Cognome', 'Codice Fiscale', 'Email']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [25, 135, 84], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [240, 248, 244] },
        margin: { left: 10, right: 10 },
    });

    _pdfFooter(doc);
    doc.save(`pazienti_${new Date().toISOString().slice(0, 10)}.pdf`);
    mostraNotifica(`PDF generato: ${body.length} pazienti.`);
}

// ── PDF Cartella Clinica individuale ──
async function esportaCartellaPDF() {
    if (!window.jspdf) { mostraNotifica('Libreria PDF non ancora caricata.', false); return; }
    if (!_pazienteCartellaId) return;

    const info = _pazienteCartellaInfo;
    const res  = await fetch(`/pazienti/${_pazienteCartellaId}/visite`, { headers: authHeaders() });
    if (!res.ok) { mostraNotifica('Errore durante la generazione del PDF.', false); return; }
    const visite = await res.json();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // Header con colore cartella (blu-viola)
    doc.setFillColor(13, 110, 253);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Cartella Clinica', 10, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Gestionale Clinica Pro', 10, 22);
    doc.text(new Date().toLocaleDateString('it-IT'), 200, 22, { align: 'right' });

    // Scheda paziente con bordo
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(13, 110, 253);
    doc.setLineWidth(0.4);
    doc.roundedRect(10, 31, 190, 26, 2.5, 2.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${info.nome} ${info.cognome}`, 15, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    doc.text(`CF: ${info.cf}`, 15, 47);
    doc.text(`Email: ${info.email}`, 15, 52);
    doc.text(`Tel: ${info.tel || '—'}`, 115, 47);
    doc.text(`Visite registrate: ${visite.length}`, 115, 52);

    // Titolo sezione visite
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Storico Visite', 10, 66);

    if (visite.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text('Nessuna visita registrata per questo paziente.', 10, 76);
    } else {
        doc.autoTable({
            startY: 70,
            head: [['Data', 'Medico', 'Motivo', 'Diagnosi', 'Trattamento']],
            body: visite.map(v => [
                new Date(v.data_visita).toLocaleDateString('it-IT'),
                v.nome_medico || '—',
                v.motivo      || '—',
                v.diagnosi    || '—',
                v.trattamento || '—',
            ]),
            theme: 'striped',
            headStyles: { fillColor: [13, 110, 253], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [240, 245, 255] },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 38 },
                2: { cellWidth: 40 },
                3: { cellWidth: 48 },
                4: { cellWidth: 42 },
            },
            margin: { left: 10, right: 10 },
        });
    }

    // Footer
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(160);
        doc.text('Documento generato automaticamente — Gestionale Clinica Pro', 10, 291);
        doc.text(`Pagina ${i} di ${pages}`, 200, 291, { align: 'right' });
    }

    const nomeFile = `cartella_${info.cognome}_${info.nome}_${new Date().toISOString().slice(0, 10)}.pdf`
        .toLowerCase().replace(/\s+/g, '_');
    doc.save(nomeFile);
    mostraNotifica(`PDF cartella generato (${visite.length} visite).`);
}

// ── Prescrizioni digitali (cartella clinica) ───────────────────────────────

let _prescrizioniCartella = [];

function aggiungiRigaFarmacoPrescrizione(nome = '', posologia = '', durata = '', qty = '') {
    const wrap = document.getElementById('farmaci-prescrizione-lista');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = 'd-flex flex-wrap gap-1 mb-1 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm prescr-farm-nome" style="min-width:140px;flex:1"
               placeholder="Farmaco" value="${escapeHtml(nome)}">
        <input type="text" class="form-control form-control-sm prescr-farm-pos" style="min-width:120px;flex:1"
               placeholder="Posologia" value="${escapeHtml(posologia)}">
        <input type="text" class="form-control form-control-sm prescr-farm-dur" style="width:88px"
               placeholder="Durata" value="${escapeHtml(durata)}">
        <input type="text" class="form-control form-control-sm prescr-farm-qty" style="width:88px"
               placeholder="Q.tà" value="${escapeHtml(qty)}">
        <button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('div').remove()">✕</button>`;
    wrap.appendChild(div);
}

function _resetFormNuovaPrescrizione(pazienteId) {
    document.getElementById('prescrizione-paziente-id').value = pazienteId;
    document.getElementById('prescrizione-diagnosi').value = '';
    document.getElementById('prescrizione-note').value = '';
    const d = document.getElementById('prescrizione-data');
    if (d) d.value = new Date().toISOString().slice(0, 10);
    const lista = document.getElementById('farmaci-prescrizione-lista');
    if (lista) {
        lista.innerHTML = '';
        aggiungiRigaFarmacoPrescrizione();
    }
    _popolaSelectMediciVisita('prescrizione-medico-id');
}

async function caricaPrescrizioni(pazienteId) {
    const el = document.getElementById('lista-prescrizioni-cartella');
    if (!el) return;
    el.innerHTML = '<span class="text-muted">Caricamento…</span>';
    const res = await fetch(`/pazienti/${pazienteId}/prescrizioni`, { headers: authHeaders() });
    if (!res.ok) {
        el.textContent = 'Impossibile caricare le prescrizioni.';
        return;
    }
    _prescrizioniCartella = await res.json();
    renderListaPrescrizioniCartella();
}

function renderListaPrescrizioniCartella() {
    const el = document.getElementById('lista-prescrizioni-cartella');
    if (!el) return;
    if (_prescrizioniCartella.length === 0) {
        el.innerHTML = '<span class="text-muted fst-italic">Nessuna prescrizione registrata. Usa «+ Nuova prescrizione».</span>';
        return;
    }
    el.innerHTML = `<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-0 bg-white">
        <thead class="table-light"><tr>
            <th>Data</th><th>Medico</th><th>Farmaci</th><th style="width:130px">Azioni</th>
        </tr></thead><tbody>
        ${_prescrizioniCartella.map((p) => {
        const nFarm = (p.farmaci || []).length;
        const dataIt = p.data_prescrizione ? new Date(p.data_prescrizione + 'T12:00:00').toLocaleDateString('it-IT') : '—';
        const delBtn = `<button type="button" class="btn btn-outline-danger btn-sm py-0" onclick="eliminaPrescrizione(${p.id})">Elimina</button>`;
        return `<tr>
            <td class="text-nowrap">${dataIt}</td>
            <td>${escapeHtml(p.nome_medico || '—')}</td>
            <td class="small">${nFarm} voce/i${p.diagnosi_riferimento ? ` · <span class="text-muted">${escapeHtml(p.diagnosi_riferimento)}</span>` : ''}</td>
            <td class="text-nowrap">
                <button type="button" class="btn btn-outline-primary btn-sm py-0" onclick="esportaPrescrizionePDFDaId(${p.id})">📄 PDF</button>
                ${delBtn}
            </td>
        </tr>`;
    }).join('')}
        </tbody></table></div>`;
}

// Evita problemi di quoting: passa solo l'id e legge dalla cache
function esportaPrescrizionePDFDaId(id) {
    const p = _prescrizioniCartella.find((x) => x.id === id);
    if (p) esportaPrescrizionePDF(p);
}

async function salvaPrescrizione(e) {
    e.preventDefault();
    const pazienteId = document.getElementById('prescrizione-paziente-id').value;
    const farmaci = [...document.querySelectorAll('#farmaci-prescrizione-lista > div')].map((row) => ({
        nome: row.querySelector('.prescr-farm-nome').value.trim(),
        posologia: row.querySelector('.prescr-farm-pos').value.trim(),
        durata: row.querySelector('.prescr-farm-dur').value.trim(),
        qty: row.querySelector('.prescr-farm-qty').value.trim(),
    })).filter((f) => f.nome);
    if (!farmaci.length) {
        mostraNotifica('Inserisci almeno un farmaco con nome indicato.', false);
        return;
    }
    const payload = {
        medico_id: parseInt(document.getElementById('prescrizione-medico-id').value, 10),
        data_prescrizione: document.getElementById('prescrizione-data').value,
        farmaci,
        diagnosi_riferimento: document.getElementById('prescrizione-diagnosi').value.trim(),
        note_prescrittore: document.getElementById('prescrizione-note').value.trim(),
    };
    const res = await fetch(`/pazienti/${pazienteId}/prescrizioni`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (res.ok) {
        const nuova = await res.json();
        _prescrizioniCartella.unshift(nuova);
        renderListaPrescrizioniCartella();
        bootstrap.Collapse.getOrCreateInstance(document.getElementById('formNuovaPrescrizione'), { toggle: false }).hide();
        _resetFormNuovaPrescrizione(pazienteId);
        mostraNotifica('Prescrizione salvata. Puoi generare il PDF dalla tabella.');
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(formatApiError(err), false);
    }
}

async function eliminaPrescrizione(id) {
    if (!confirm('Eliminare definitivamente questa prescrizione?')) return;
    const res = await fetch(`/prescrizioni/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
        _prescrizioniCartella = _prescrizioniCartella.filter((p) => p.id !== id);
        renderListaPrescrizioniCartella();
        mostraNotifica('Prescrizione eliminata.');
    } else {
        mostraNotifica('Errore durante l\'eliminazione.', false);
    }
}

function esportaPrescrizionePDF(p) {
    if (!window.jspdf) {
        mostraNotifica('Libreria PDF non ancora caricata.', false);
        return;
    }
    if (!_pazienteCartellaInfo) return;
    const info = _pazienteCartellaInfo;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    doc.setFillColor(25, 135, 84);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Prescrizione medica', 10, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Gestionale Clinica — documento informativo', 10, 23);
    doc.text(new Date().toLocaleString('it-IT'), 200, 23, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(25, 135, 84);
    doc.roundedRect(10, 34, 190, 28, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Paziente: ${info.nome} ${info.cognome}`, 14, 43);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    doc.text(`CF: ${info.cf}`, 14, 50);
    doc.text(`Prescrittore: ${p.nome_medico || '—'}`, 14, 56);
    const dataIt = p.data_prescrizione
        ? new Date(p.data_prescrizione + 'T12:00:00').toLocaleDateString('it-IT')
        : '—';
    doc.text(`Data prescrizione: ${dataIt}`, 120, 50);
    if (p.diagnosi_riferimento) {
        doc.setTextColor(40);
        doc.text(`Diagnosi / indicazione: ${p.diagnosi_riferimento}`, 120, 56);
    }

    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Farmaci prescritti', 10, 72);

    const body = (p.farmaci || []).map((f) => [
        f.nome || '—',
        f.posologia || '—',
        f.durata || '—',
        f.qty || '—',
    ]);
    doc.autoTable({
        startY: 76,
        head: [['Farmaco', 'Posologia', 'Durata', 'Quantità']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [25, 135, 84], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8.5 },
        margin: { left: 10, right: 10 },
    });

    let y = doc.lastAutoTable.finalY + 8;
    if (p.note_prescrittore) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Note e avvertenze', 10, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(p.note_prescrittore, 190);
        doc.text(lines, 10, y);
        y += lines.length * 4 + 6;
    }

    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.line(10, Math.min(y + 4, 250), 100, Math.min(y + 4, 250));
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Firma prescrittore', 10, Math.min(y + 12, 258));

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text('Documento generato dal gestionale — verificare sempre dosi e interazioni.', 10, 288);
        doc.text(`Pag. ${i}/${pages}`, 200, 288, { align: 'right' });
    }

    const fname = `prescrizione_${info.cognome}_${p.id}.pdf`.toLowerCase().replace(/\s+/g, '_');
    doc.save(fname);
    mostraNotifica('PDF prescrizione scaricato.');
}

// ═══════════════════════════════════════════════════════
//  CARTELLA CLINICA
// ═══════════════════════════════════════════════════════

let _pazienteCartellaId = null;

function apriCartellaClinica(id, nome, cognome, cf, email, tel) {
    _pazienteCartellaId   = id;
    _pazienteCartellaInfo = { id, nome, cognome, cf, email, tel };

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

    // Resetta il form anamnesi e chiude il collapse
    const collapseAnamnesi = document.getElementById('formAnamnesi');
    if (collapseAnamnesi) bootstrap.Collapse.getOrCreateInstance(collapseAnamnesi, { toggle: false }).hide();

    const collapsePresc = document.getElementById('formNuovaPrescrizione');
    if (collapsePresc) bootstrap.Collapse.getOrCreateInstance(collapsePresc, { toggle: false }).hide();
    _resetFormNuovaPrescrizione(id);

    // Apre il modal
    new bootstrap.Modal(document.getElementById('modalCartella')).show();

    // Carica visite, anamnesi e prescrizioni in parallelo
    caricaVisite(id);
    caricaAnamnesi(id);
    caricaPrescrizioni(id);
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
//  GESTIONE UTENTI (solo admin)
// ═══════════════════════════════════════════════════════

async function caricaUtenti() {
    const res = await fetch('/utenti', { headers: authHeaders() });
    if (!res.ok) return;
    const utenti = await res.json();
    const tbody = document.getElementById('tabella-utenti');
    if (!tbody) return;
    tbody.innerHTML = '';
    utenti.forEach(u => {
        const isMe = u.username === _userName;
        const ruoloClass = _ruoloClass[u.ruolo] || '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-muted small">${escapeHtml(u.id)}</td>
            <td class="fw-semibold">${escapeHtml(u.username)} ${isMe ? '<span class="badge bg-secondary ms-1">tu</span>' : ''}</td>
            <td><span class="ruolo-badge ${ruoloClass}" style="font-size:.68rem">${escapeHtml(_ruoloLabel[u.ruolo] || u.ruolo)}</span></td>
            <td>
                ${!isMe ? `<button class="btn btn-outline-danger btn-sm" onclick="eliminaUtente(${u.id})">Elimina</button>` : '—'}
            </td>`;
        tbody.appendChild(tr);
    });
}

async function creaUtente(e) {
    e.preventDefault();
    const dati = {
        username: document.getElementById('nuovo-username').value.trim(),
        password: document.getElementById('nuovo-password').value,
        ruolo:    document.getElementById('nuovo-ruolo').value,
    };
    const res = await fetch('/register', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(dati),
    });
    if (res.ok) {
        mostraNotifica(`Utente "${dati.username}" creato con ruolo ${_ruoloLabel[dati.ruolo] || dati.ruolo}`);
        e.target.reset();
        caricaUtenti();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore nella creazione utente.', false);
    }
}

async function eliminaUtente(id) {
    if (!confirm('Vuoi davvero eliminare questo utente?')) return;
    const res = await fetch(`/utenti/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (res.ok) {
        mostraNotifica('Utente eliminato.');
        caricaUtenti();
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore.', false);
    }
}

// Carica utenti quando si apre il tab Utenti
document.addEventListener('DOMContentLoaded', () => {
    const tabUtenti = document.getElementById('tab-utenti');
    if (tabUtenti) {
        tabUtenti.addEventListener('shown.bs.tab', () => {
            caricaUtenti();
            caricaStatoEmail();
        });
    }
});

// ═══════════════════════════════════════════════════════
//  EMAIL AUTOMATICHE
// ═══════════════════════════════════════════════════════

async function caricaStatoEmail() {
    const badge = document.getElementById('email-stato-badge');
    const info  = document.getElementById('email-stato-info');
    if (!badge) return;
    try {
        const res = await fetch('/email/stato', { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (data.abilitato) {
            badge.textContent = '✅ Abilitata';
            badge.className   = 'badge bg-success';
            if (info) info.textContent = `Da: ${data.from || data.user}`;
        } else {
            badge.textContent = '❌ Non configurata';
            badge.className   = 'badge bg-warning text-dark';
            if (info) info.textContent = 'Aggiungi SMTP_HOST, SMTP_USER, SMTP_PASS nel file .env';
        }
    } catch {
        if (badge) { badge.textContent = 'Errore'; badge.className = 'badge bg-danger'; }
    }
}

async function testEmail() {
    const res = await fetch('/email/test', {
        method: 'POST',
        headers: authHeaders(),
    });
    if (res.ok) {
        const data = await res.json();
        mostraNotifica(data.message, true);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore invio email di test', false);
    }
}

async function inviaPromemoriaDomani() {
    if (!confirm('Inviare email di promemoria a tutti i pazienti con appuntamento domani?')) return;
    const res = await fetch('/email/promemoria-domani', {
        method: 'POST',
        headers: authHeaders(),
    });
    if (res.ok) {
        const data = await res.json();
        mostraNotifica(data.message, true);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore invio promemoria', false);
    }
}

async function inviaEmailTurno(id) {
    const res = await fetch(`/turni/${id}/email`, {
        method: 'POST',
        headers: authHeaders(),
    });
    if (res.ok) {
        const data = await res.json();
        mostraNotifica(data.message, true);
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Impossibile inviare email (controlla la configurazione SMTP)', false);
    }
}

// ═══════════════════════════════════════════════════════
//  SALA D'ATTESA DIGITALE
// ═══════════════════════════════════════════════════════

let _salaInterval = null;
let _salaDati     = [];

async function checkInTurno(id) {
    const res = await fetch(`/turni/${id}/checkin`, {
        method: 'POST',
        headers: authHeaders(),
    });
    if (res.ok) {
        // Aggiorna lo stato in-memory nella tabella turni
        const idx = _allTurni.findIndex(t => t.id === id);
        if (idx !== -1) {
            _allTurni[idx].stato = 'arrivato';
            _allTurni[idx].orario_arrivo = new Date().toISOString();
        }
        filtraTurni();
        mostraNotifica('Check-in effettuato. Paziente in sala d\'attesa.');
        // Ricarica la sala se il tab è visibile
        if (document.getElementById('pane-sala')?.classList.contains('active')) {
            caricaSalaAttesa();
        }
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore durante il check-in.', false);
    }
}

async function caricaSalaAttesa() {
    const res = await fetch('/sala-attesa/oggi', { headers: authHeaders() });
    if (!res.ok) return;
    _salaDati = await res.json();

    // KPI contatori
    const nAttesa  = _salaDati.filter(e => e.stato === 'arrivato').length;
    const nMedico  = _salaDati.filter(e => e.stato === 'con_medico').length;
    document.getElementById('kpi-in-attesa').textContent  = nAttesa;
    document.getElementById('kpi-con-medico').textContent = nMedico;

    // Completati oggi: prendo dai turni
    const oggi = new Date().toISOString().slice(0, 10);
    const completatiOggi = _allTurni.filter(t => t.stato === 'completato' && (t.orario || '').startsWith(oggi)).length;
    document.getElementById('kpi-completati-oggi').textContent = completatiOggi;

    // Media attesa (pazienti arrivati, calcolata da orario_arrivo)
    const tempi = _salaDati
        .filter(e => e.orario_arrivo)
        .map(e => Math.floor((Date.now() - new Date(e.orario_arrivo).getTime()) / 60000));
    const media = tempi.length > 0 ? Math.round(tempi.reduce((a, b) => a + b, 0) / tempi.length) : null;
    document.getElementById('kpi-media-attesa').textContent = media !== null ? media : '—';

    // Last update
    const lu = document.getElementById('sala-last-update');
    if (lu) lu.textContent = `Aggiornato alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;

    renderCoda();
}

function renderCoda() {
    const container = document.getElementById('sala-coda');
    if (!container) return;

    if (_salaDati.length === 0) {
        container.innerHTML = `
            <div class="sala-vuota w-100">
                <div style="font-size:3rem">🏥</div>
                <div class="mt-2 fw-semibold">Sala d'attesa vuota</div>
                <div class="small mt-1">Nessun paziente presente in questo momento</div>
            </div>`;
        return;
    }

    // Prima i "arrivato" (in attesa), poi "con_medico"
    const ordinati = [
        ..._salaDati.filter(e => e.stato === 'arrivato'),
        ..._salaDati.filter(e => e.stato === 'con_medico'),
    ];

    let posizione = 0;
    container.innerHTML = ordinati.map(e => {
        const statoMedico = e.stato === 'con_medico';
        posizione++;

        // Timer attesa
        const mins = e.orario_arrivo
            ? Math.floor((Date.now() - new Date(e.orario_arrivo).getTime()) / 60000)
            : 0;
        let timerClass, timerLabel;
        if (statoMedico) {
            timerClass = 'timer-medico'; timerLabel = '🟢 Con il medico';
        } else if (mins < 20) {
            timerClass = 'timer-ok';    timerLabel = `⏱ ${mins} min`;
        } else if (mins < 40) {
            timerClass = 'timer-warn';  timerLabel = `⚠️ ${mins} min`;
        } else {
            timerClass = 'timer-alert'; timerLabel = `🔴 ${mins} min`;
        }

        const btnChiama = e.stato === 'arrivato'
            ? `<button class="btn btn-success btn-sm fw-semibold"
                       onclick="aggiornaSalaTurno(${e.turno_id},'con_medico')">
                   👨‍⚕️ Chiama
               </button>`
            : `<button class="btn btn-outline-secondary btn-sm"
                       onclick="aggiornaSalaTurno(${e.turno_id},'arrivato')">
                   ↩ Rimetti in attesa
               </button>`;

        const btnCompleta = `<button class="btn btn-primary btn-sm fw-semibold"
                                     onclick="aggiornaSalaTurno(${e.turno_id},'completato')">
                                 ✅ Completa
                             </button>`;

        const orarioApp = e.orario_appuntamento ? e.orario_appuntamento.substring(11, 16) : '—';

        return `
        <div class="coda-card stato-${e.stato}" data-turno-id="${e.turno_id}">
            <span class="coda-pos">${posizione}</span>
            <div class="d-flex justify-content-between align-items-start mt-1">
                <div>
                    <div class="coda-paziente">${escapeHtml(e.cognome_paziente)} ${escapeHtml(e.nome_paziente)}</div>
                    <div class="coda-medico">Dott. ${escapeHtml(e.nome_medico)} · Stanza ${escapeHtml(e.stanza)}</div>
                </div>
                <span class="badge rounded-pill ${statoMedico ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:.68rem">
                    ${statoMedico ? 'Con medico' : 'In attesa'}
                </span>
            </div>
            <div class="d-flex align-items-center gap-2 mb-3">
                <span class="timer-attesa ${timerClass}" data-arrivo="${e.orario_arrivo}">${timerLabel}</span>
                <span class="text-muted small">· App. ${orarioApp}</span>
            </div>
            <div class="d-flex gap-2">
                ${btnChiama}
                ${btnCompleta}
            </div>
        </div>`;
    }).join('');
}

async function aggiornaSalaTurno(turnoId, nuovoStato) {
    const res = await fetch(`/turni/${turnoId}/stato`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato: nuovoStato }),
    });
    if (res.ok) {
        if (nuovoStato === 'completato') {
            _salaDati = _salaDati.filter(e => e.turno_id !== turnoId);
            // Aggiorna KPI completati
            const kpiEl = document.getElementById('kpi-completati-oggi');
            if (kpiEl) kpiEl.textContent = parseInt(kpiEl.textContent || '0') + 1;
            mostraNotifica('Visita completata.');
        } else {
            const idx = _salaDati.findIndex(e => e.turno_id === turnoId);
            if (idx !== -1) _salaDati[idx].stato = nuovoStato;
        }
        // Aggiorna anche _allTurni
        const tIdx = _allTurni.findIndex(t => t.id === turnoId);
        if (tIdx !== -1) _allTurni[tIdx].stato = nuovoStato;

        renderCoda();
        // Aggiorna KPI
        document.getElementById('kpi-in-attesa').textContent  = _salaDati.filter(e => e.stato === 'arrivato').length;
        document.getElementById('kpi-con-medico').textContent = _salaDati.filter(e => e.stato === 'con_medico').length;
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore aggiornamento stato.', false);
    }
}

// Aggiorna i timer ogni minuto senza fare fetch (solo re-render)
function _avviaSalaTimer() {
    if (_salaInterval) clearInterval(_salaInterval);
    _salaInterval = setInterval(() => {
        // aggiorna solo i timer nelle card già renderizzate (DOM update leggero)
        document.querySelectorAll('.timer-attesa[data-arrivo]').forEach(el => {
            const arrivo = el.dataset.arrivo;
            if (!arrivo) return;
            const mins = Math.floor((Date.now() - new Date(arrivo).getTime()) / 60000);
            let cls, lbl;
            if (mins < 20) { cls = 'timer-ok';   lbl = `⏱ ${mins} min`; }
            else if (mins < 40) { cls = 'timer-warn'; lbl = `⚠️ ${mins} min`; }
            else { cls = 'timer-alert'; lbl = `🔴 ${mins} min`; }
            el.className = `timer-attesa ${cls}`;
            el.textContent = lbl;
        });
    }, 60000);
}

// Listener tab sala d'attesa
document.addEventListener('DOMContentLoaded', () => {
    const tabSala = document.getElementById('tab-sala');
    if (tabSala) {
        tabSala.addEventListener('shown.bs.tab', () => {
            caricaSalaAttesa();
            _avviaSalaTimer();
        });
        tabSala.addEventListener('hidden.bs.tab', () => {
            if (_salaInterval) { clearInterval(_salaInterval); _salaInterval = null; }
        });
    }
});

// ═══════════════════════════════════════════════════════
//  LISTA D'ATTESA INTELLIGENTE
// ═══════════════════════════════════════════════════════

let _allAttesa = [];

const _prioritaLabel = { 1: '🔴 Urgente', 2: '🟡 Alta', 3: '🟢 Normale' };
const _prioritaClass = { 1: 'priorita-1',  2: 'priorita-2',  3: 'priorita-3' };
const _attesaStatoLabel = {
    attesa:     'In Attesa',
    contattato: 'Contattato',
    confermato: 'Confermato',
    rimosso:    'Rimosso',
};
const _attesaStatoClass = {
    attesa:     'attesa-stato-attesa',
    contattato: 'attesa-stato-contattato',
    confermato: 'attesa-stato-confermato',
    rimosso:    'attesa-stato-rimosso',
};

async function caricaListaAttesa() {
    const res = await fetch('/lista-attesa', { headers: authHeaders() });
    if (!res.ok) return;
    _allAttesa = await res.json();
    _popolaSelectAttesa();
    filtraAttesa();
}

function _popolaSelectAttesa() {
    // select pazienti nel form
    const sel = document.getElementById('attesa-paziente-id');
    if (!sel) return;
    const curr = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Seleziona paziente...</option>';
    _allPazienti.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = `${p.cognome} ${p.nome}`;
        sel.appendChild(o);
    });
    if (curr) sel.value = curr;

    // select medici nel form
    const selM = document.getElementById('attesa-medico-id');
    if (!selM) return;
    const currM = selM.value;
    selM.innerHTML = '<option value="">Qualunque / non specificato</option>';
    Object.values(_medicoMap).forEach(m => {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = `${m.nome} ${m.cognome} — ${m.specializzazione}`;
        selM.appendChild(o);
    });
    if (currM) selM.value = currM;
}

function filtraAttesa() {
    const prioritaFil = document.getElementById('filtro-attesa-priorita')?.value || '';
    const statoFil    = document.getElementById('filtro-attesa-stato')?.value    || '';
    const testoFil    = (document.getElementById('filtro-attesa-testo')?.value || '').toLowerCase();

    const lista = _allAttesa.filter(e => {
        if (prioritaFil && String(e.priorita) !== prioritaFil) return false;
        if (statoFil    && e.stato !== statoFil)               return false;
        if (testoFil) {
            const haystack = `${e.nome_paziente} ${e.cognome_paziente} ${e.specializzazione} ${e.nome_medico}`.toLowerCase();
            if (!haystack.includes(testoFil)) return false;
        }
        return true;
    });

    const counter = document.getElementById('attesa-counter');
    if (counter) counter.textContent = `${lista.length} pazient${lista.length === 1 ? 'e' : 'i'}`;

    _renderTabellaAttesa(lista);
}

function _renderTabellaAttesa(lista) {
    const tbody = document.getElementById('tabella-attesa');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-5">
            <div style="font-size:2rem">⏳</div>
            <div class="mt-2">Nessun paziente in lista d'attesa.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map((e, idx) => {
        const pClss = _prioritaClass[e.priorita] || 'priorita-3';
        const pLbl  = _prioritaLabel[e.priorita]  || 'Normale';
        const sClss = _attesaStatoClass[e.stato]  || '';
        const sLbl  = _attesaStatoLabel[e.stato]  || e.stato;
        const medico = e.nome_medico || e.specializzazione || '—';
        const data   = e.data_inserimento ? e.data_inserimento.substring(0, 10) : '—';

        const canNotify = e.stato === 'attesa' || e.stato === 'contattato';
        const btnNotifica = canNotify
            ? `<button class="btn btn-sm btn-outline-primary" title="Invia email paziente"
                       onclick="notificaAttesa(${e.id})">📧</button>`
            : '';
        const btnConverti = `<button class="btn btn-sm btn-success" title="Converti in appuntamento"
                                     onclick="convertiInAppuntamento(${e.paziente_id}, ${e.medico_id || 'null'})">📅</button>`;
        const btnRimuovi = `<button class="btn btn-sm btn-outline-danger" title="Rimuovi dalla lista"
                                    onclick="rimuoviDaAttesa(${e.id})">🗑</button>`;

        return `<tr>
            <td><span class="attesa-pos">${idx + 1}</span></td>
            <td>
                <div class="fw-semibold">${escapeHtml(e.cognome_paziente)} ${escapeHtml(e.nome_paziente)}</div>
                <div class="text-muted small">${escapeHtml(e.email_paziente)}</div>
            </td>
            <td class="small">${escapeHtml(medico)}</td>
            <td><span class="priorita-badge ${pClss}">${pLbl}</span></td>
            <td class="small text-muted">${data}</td>
            <td class="small text-muted" style="max-width:160px;white-space:normal">${escapeHtml(e.note || '—')}</td>
            <td><span class="badge rounded-pill ${sClss} fw-semibold" style="font-size:.72rem">${sLbl}</span></td>
            <td>
                <div class="d-flex gap-1 flex-wrap">
                    ${btnNotifica}${btnConverti}${btnRimuovi}
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function aggiungiInAttesa(e) {
    e.preventDefault();
    const pazId  = document.getElementById('attesa-paziente-id').value;
    const medId  = document.getElementById('attesa-medico-id').value || null;
    const spec   = document.getElementById('attesa-specializzazione').value.trim();
    const prio   = parseInt(document.getElementById('attesa-priorita').value);
    const note   = document.getElementById('attesa-note').value.trim();

    if (!pazId) { mostraNotifica('Seleziona un paziente.', false); return; }

    const res = await fetch('/lista-attesa', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            paziente_id: parseInt(pazId),
            medico_id: medId ? parseInt(medId) : null,
            specializzazione: spec,
            priorita: prio,
            note,
            data_inserimento: new Date().toISOString(),
        }),
    });

    if (res.ok) {
        const nuova = await res.json();
        _allAttesa.unshift(nuova);
        // ordina per priorità poi data
        _allAttesa.sort((a, b) => a.priorita - b.priorita || a.data_inserimento.localeCompare(b.data_inserimento));
        filtraAttesa();
        document.getElementById('formAttesa').reset();
        bootstrap.Collapse.getOrCreateInstance(document.getElementById('formNuovaAttesa'), { toggle: false }).hide();
        mostraNotifica('Paziente aggiunto in lista d\'attesa.');
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore durante l\'aggiunta.', false);
    }
}

async function notificaAttesa(id) {
    const ok = confirm('Inviare una email al paziente per comunicare la disponibilità del posto?');
    if (!ok) return;
    const res = await fetch(`/lista-attesa/${id}/notifica`, {
        method: 'POST',
        headers: authHeaders(),
    });
    if (res.ok) {
        const idx = _allAttesa.findIndex(e => e.id === id);
        if (idx !== -1) _allAttesa[idx].stato = 'contattato';
        filtraAttesa();
        mostraNotifica('Email di notifica inviata al paziente.');
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore invio email.', false);
    }
}

async function rimuoviDaAttesa(id) {
    if (!confirm('Rimuovere questo paziente dalla lista d\'attesa?')) return;
    const res = await fetch(`/lista-attesa/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (res.ok) {
        _allAttesa = _allAttesa.filter(e => e.id !== id);
        filtraAttesa();
        mostraNotifica('Paziente rimosso dalla lista d\'attesa.');
    } else {
        mostraNotifica('Errore durante la rimozione.', false);
    }
}

function convertiInAppuntamento(pazienteId, medicoId) {
    // Porta l'utente al tab appuntamenti con il form pre-compilato
    const tabTurni = document.getElementById('tab-turni');
    if (tabTurni) bootstrap.Tab.getOrCreateInstance(tabTurni).show();

    setTimeout(() => {
        // Apre il form nuovo appuntamento
        const formCollapse = document.getElementById('formNuovoTurno');
        if (formCollapse) bootstrap.Collapse.getOrCreateInstance(formCollapse, { toggle: false }).show();

        // Pre-compila paziente e medico
        const selPaz = document.getElementById('nuovo-paziente-id');
        if (selPaz && pazienteId) selPaz.value = pazienteId;

        const selMed = document.getElementById('nuovo-medico-id');
        if (selMed && medicoId) selMed.value = medicoId;

        // Scroll al form
        formCollapse?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        mostraNotifica('Form appuntamento pre-compilato — completa orario e stanza.');
    }, 350);
}

// Listener tab lista d'attesa
document.addEventListener('DOMContentLoaded', () => {
    const tabAttesa = document.getElementById('tab-attesa');
    if (tabAttesa) {
        tabAttesa.addEventListener('shown.bs.tab', () => {
            caricaListaAttesa();
        });
    }
});

// ═══════════════════════════════════════════════════════
//  ANAMNESI PAZIENTE
// ═══════════════════════════════════════════════════════

const _gravitaLabel = { grave: 'GRAVE', moderata: 'MODERATA', lieve: 'LIEVE' };
const _gravitaClass = { grave: 'allergia-grave', moderata: 'allergia-moderata', lieve: 'allergia-lieve' };

async function caricaAnamnesi(pazienteId) {
    const res = await fetch(`/pazienti/${pazienteId}/anamnesi`, { headers: authHeaders() });
    if (!res.ok) return;
    const dati = await res.json();
    renderAnamnesi(dati);
    _precompilaFormAnamnesi(dati, pazienteId);
}

function renderAnamnesi(d) {
    // Gruppo sanguigno
    const gsBadge = document.getElementById('anamnesi-gruppo-badge');
    if (gsBadge) {
        gsBadge.textContent = d.gruppo_sanguigno || '—';
        gsBadge.className = `gruppo-sangue-badge${d.gruppo_sanguigno ? '' : ' gruppo-sangue-vuoto'}`;
    }

    // Alert allergie gravi
    const gravi = (d.allergie || []).filter(a => a.gravita === 'grave');
    const alertEl = document.getElementById('anamnesi-alert-grave');
    const alertTesto = document.getElementById('anamnesi-alert-testo');
    if (alertEl) {
        if (gravi.length > 0) {
            alertEl.classList.remove('d-none');
            alertTesto.textContent = gravi.map(a => a.nome).join(', ');
        } else {
            alertEl.classList.add('d-none');
        }
    }

    // Grid anamnesi
    const body = document.getElementById('anamnesi-body');
    if (!body) return;

    // Allergie
    const allergieHtml = (d.allergie || []).length > 0
        ? d.allergie.map(a => {
            const cls = _gravitaClass[a.gravita] || 'allergia-lieve';
            const lbl = _gravitaLabel[a.gravita] || a.gravita;
            return `<span class="allergia-badge ${cls}">${escapeHtml(a.nome)} <small>${lbl}</small></span>`;
          }).join('')
        : '<span class="anamnesi-empty">Nessuna allergia registrata</span>';

    // Patologie
    const patologieHtml = (d.patologie_croniche || []).length > 0
        ? d.patologie_croniche.map(p => `<span class="tag-patologia">${escapeHtml(p)}</span>`).join('')
        : '<span class="anamnesi-empty">Nessuna patologia cronica</span>';

    // Farmaci
    const farmaciHtml = (d.farmaci_in_corso || []).length > 0
        ? d.farmaci_in_corso.map(f =>
            `<div class="tag-farmaco">
              <span class="farmaco-nome">• ${escapeHtml(f.nome)}</span>
              ${f.dosaggio ? `<span class="farmaco-dose">${escapeHtml(f.dosaggio)}</span>` : ''}
            </div>`).join('')
        : '<span class="anamnesi-empty">Nessun farmaco in corso</span>';

    // Contatto emergenza
    const ceHtml = d.contatto_emergenza_nome
        ? `<div class="fw-semibold small">${escapeHtml(d.contatto_emergenza_nome)}</div>
           ${d.contatto_emergenza_relazione ? `<div class="text-muted" style="font-size:.75rem">${escapeHtml(d.contatto_emergenza_relazione)}</div>` : ''}
           ${d.contatto_emergenza_tel ? `<div class="text-primary" style="font-size:.78rem">📞 ${escapeHtml(d.contatto_emergenza_tel)}</div>` : ''}`
        : '<span class="anamnesi-empty">Non specificato</span>';

    body.innerHTML = `
        <div><div class="anamnesi-section-title">🔴 Allergie</div>${allergieHtml}</div>
        <div><div class="anamnesi-section-title">🫀 Patologie Croniche</div>${patologieHtml}</div>
        <div><div class="anamnesi-section-title">💊 Farmaci in Corso</div>${farmaciHtml}</div>
        <div><div class="anamnesi-section-title">👥 Contatto Emergenza</div>${ceHtml}</div>
    `;

    // Note
    const noteWrap = document.getElementById('anamnesi-note-wrap');
    const noteTesto = document.getElementById('anamnesi-note-testo');
    if (noteWrap) {
        if (d.note_anamnestiche) {
            noteWrap.classList.remove('d-none');
            noteTesto.textContent = d.note_anamnestiche;
        } else {
            noteWrap.classList.add('d-none');
        }
    }
}

function _precompilaFormAnamnesi(d, pazienteId) {
    document.getElementById('anamnesi-paziente-id').value = pazienteId;
    const gs = document.getElementById('anamnesi-gruppo');
    if (gs) gs.value = d.gruppo_sanguigno || '';
    document.getElementById('anamnesi-ce-nome').value = d.contatto_emergenza_nome || '';
    document.getElementById('anamnesi-ce-tel').value  = d.contatto_emergenza_tel  || '';
    document.getElementById('anamnesi-ce-rel').value  = d.contatto_emergenza_relazione || '';
    document.getElementById('anamnesi-note').value    = d.note_anamnestiche || '';

    // Allergie
    const allergieDiv = document.getElementById('allergie-lista');
    allergieDiv.innerHTML = '';
    (d.allergie || []).forEach(a => _aggiungiRigaAllergia(a.nome, a.gravita));

    // Patologie
    const patDiv = document.getElementById('patologie-lista');
    patDiv.innerHTML = '';
    (d.patologie_croniche || []).forEach(p => _aggiungiRigaPatologia(p));

    // Farmaci
    const farDiv = document.getElementById('farmaci-lista');
    farDiv.innerHTML = '';
    (d.farmaci_in_corso || []).forEach(f => _aggiungiRigaFarmaco(f.nome, f.dosaggio));
}

// ── Righe dinamiche form ───────────────────────────────────────────────────

function aggiungiRigaAllergia()  { _aggiungiRigaAllergia('', 'moderata'); }
function aggiungiRigaPatologia() { _aggiungiRigaPatologia(''); }
function aggiungiRigaFarmaco()   { _aggiungiRigaFarmaco('', ''); }

function _aggiungiRigaAllergia(nome, gravita) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-1 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm allergia-nome" value="${escapeHtml(nome)}" placeholder="Sostanza (es. Penicillina)">
        <select class="form-select form-select-sm allergia-gravita" style="max-width:130px">
            <option value="lieve"    ${gravita==='lieve'    ?'selected':''}>Lieve</option>
            <option value="moderata" ${gravita==='moderata' ?'selected':''}>Moderata</option>
            <option value="grave"    ${gravita==='grave'    ?'selected':''}>Grave</option>
        </select>
        <button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('div').remove()">✕</button>`;
    document.getElementById('allergie-lista').appendChild(div);
}

function _aggiungiRigaPatologia(testo) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-1 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm patologia-nome" value="${escapeHtml(testo)}" placeholder="Es. Diabete tipo 2">
        <button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('div').remove()">✕</button>`;
    document.getElementById('patologie-lista').appendChild(div);
}

function _aggiungiRigaFarmaco(nome, dosaggio) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-1 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm farmaco-nome-input" value="${escapeHtml(nome)}" placeholder="Farmaco (es. Metformina)">
        <input type="text" class="form-control form-control-sm farmaco-dose-input" value="${escapeHtml(dosaggio)}" placeholder="Dosaggio (es. 500mg 2x/die)">
        <button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="this.closest('div').remove()">✕</button>`;
    document.getElementById('farmaci-lista').appendChild(div);
}

async function salvaAnamnesi(e) {
    e.preventDefault();
    const pazienteId = document.getElementById('anamnesi-paziente-id').value;

    const allergie = [...document.querySelectorAll('#allergie-lista > div')]
        .map(row => ({
            nome:    row.querySelector('.allergia-nome').value.trim(),
            gravita: row.querySelector('.allergia-gravita').value,
        }))
        .filter(a => a.nome);

    const patologie = [...document.querySelectorAll('#patologie-lista .patologia-nome')]
        .map(el => el.value.trim())
        .filter(Boolean);

    const farmaci = [...document.querySelectorAll('#farmaci-lista > div')]
        .map(row => ({
            nome:    row.querySelector('.farmaco-nome-input').value.trim(),
            dosaggio: row.querySelector('.farmaco-dose-input').value.trim(),
        }))
        .filter(f => f.nome);

    const payload = {
        gruppo_sanguigno:             document.getElementById('anamnesi-gruppo').value,
        allergie,
        patologie_croniche:           patologie,
        farmaci_in_corso:             farmaci,
        contatto_emergenza_nome:      document.getElementById('anamnesi-ce-nome').value.trim(),
        contatto_emergenza_tel:       document.getElementById('anamnesi-ce-tel').value.trim(),
        contatto_emergenza_relazione: document.getElementById('anamnesi-ce-rel').value.trim(),
        note_anamnestiche:            document.getElementById('anamnesi-note').value.trim(),
    };

    const res = await fetch(`/pazienti/${pazienteId}/anamnesi`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (res.ok) {
        const dati = await res.json();
        renderAnamnesi(dati);
        bootstrap.Collapse.getOrCreateInstance(document.getElementById('formAnamnesi'), { toggle: false }).hide();
        mostraNotifica('Anamnesi salvata con successo.');
    } else {
        const err = await res.json().catch(() => ({}));
        mostraNotifica(err.detail || 'Errore nel salvataggio.', false);
    }
}

// ═══════════════════════════════════════════════════════
//  AVVIO
// ═══════════════════════════════════════════════════════

aggiornaInterfaccia();
