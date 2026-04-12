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

// Istanze Chart.js (distrutte e ricreate ad ogni refresh dashboard)
let _charts = {};

async function caricaTutto() {
    await Promise.all([caricaDati(), caricaPazienti(), caricaDashboard()]);
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
function _renderTabellaTurni(lista) {
    const tbody = document.getElementById('tabella-turni');
    tbody.innerHTML = '';
    lista.forEach(t => {
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

async function caricaDashboard() {
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
        caricaDashboard();
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
    const da      = document.getElementById('filtro-da')?.value ?? '';
    const a       = document.getElementById('filtro-a')?.value ?? '';
    const medicoId = document.getElementById('filtro-medico')?.value ?? '';
    const pazId    = document.getElementById('filtro-paziente')?.value ?? '';
    const q        = (document.getElementById('cerca-turno')?.value ?? '').toLowerCase();

    let lista = _allTurni;

    if (da)       lista = lista.filter(t => t.orario && t.orario.slice(0, 10) >= da);
    if (a)        lista = lista.filter(t => t.orario && t.orario.slice(0, 10) <= a);
    if (medicoId) lista = lista.filter(t => String(t.medico_id) === medicoId);
    if (pazId)    lista = lista.filter(t => String(t.paziente_id) === pazId);
    if (q) {
        lista = lista.filter(t => {
            const med = (_medicoMap[t.medico_id]?.nome ?? '').toLowerCase();
            const paz = (_pazienteMap[t.paziente_id]?.nome ?? '').toLowerCase();
            return med.includes(q) || paz.includes(q) || (t.stanza || '').toLowerCase().includes(q);
        });
    }

    _renderTabellaTurni(lista);

    // Aggiorna badge contatore filtri attivi
    const nFiltri = [da, a, medicoId, pazId, q].filter(Boolean).length;
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
    const ids = ['filtro-da', 'filtro-a', 'filtro-medico', 'filtro-paziente', 'cerca-turno'];
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
