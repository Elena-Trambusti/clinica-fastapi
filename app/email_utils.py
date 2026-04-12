"""
Utilità per l'invio di email via SMTP.
Configura le variabili d'ambiente nel file .env:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def get_email_config() -> dict:
    return {
        "host":     os.getenv("SMTP_HOST", ""),
        "port":     int(os.getenv("SMTP_PORT", "587")),
        "user":     os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASS", ""),
        "from":     os.getenv("EMAIL_FROM", os.getenv("SMTP_USER", "Gestionale Clinica")),
        "enabled":  bool(
            os.getenv("SMTP_HOST") and
            os.getenv("SMTP_USER") and
            os.getenv("SMTP_PASS")
        ),
    }


def send_email(to: str, subject: str, body_html: str) -> bool:
    """
    Invia una email HTML via SMTP.
    Restituisce True se inviata, False se la config non è attiva o si verifica un errore.
    """
    cfg = get_email_config()
    if not cfg["enabled"]:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg["from"]
    msg["To"]      = to

    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        return True
    except Exception as exc:
        print(f"[EMAIL] Errore invio a {to}: {exc}")
        return False


# ── Template HTML ─────────────────────────────────────────────────────────────

_BASE_TEMPLATE = """\
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; }}
  .card {{ background: #fff; border-radius: 12px; max-width: 520px; margin: 0 auto;
           padding: 32px; box-shadow: 0 4px 24px rgba(13,110,253,.1); }}
  .header {{ background: linear-gradient(135deg, #0d6efd, #0099cc); border-radius: 8px;
             padding: 20px 24px; margin-bottom: 24px; }}
  .header h1 {{ color: #fff; font-size: 1.25rem; margin: 0; }}
  .header p  {{ color: rgba(255,255,255,.8); margin: 4px 0 0; font-size: .85rem; }}
  .detail-row {{ display: flex; gap: 12px; margin-bottom: 12px;
                 padding: 12px; background: #f8f9ff; border-radius: 8px; }}
  .icon {{ font-size: 1.4rem; flex-shrink: 0; }}
  .label {{ font-size: .75rem; color: #6c757d; margin-bottom: 2px; }}
  .value {{ font-weight: 600; color: #1a1a2e; }}
  .footer {{ text-align: center; margin-top: 24px; font-size: .75rem; color: #adb5bd; }}
  .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px;
            font-size: .72rem; font-weight: 700; }}
  .badge-blue {{ background: #dbeafe; color: #1d4ed8; }}
</style></head>
<body>
<div class="card">
  <div class="header">
    <h1>🏥 Gestionale Clinica Aziendale</h1>
    <p>{subtitle}</p>
  </div>
  <p style="color:#374151;margin-bottom:20px">Gentile <strong>{paziente_nome}</strong>,</p>
  {body_content}
  <div class="footer">
    © 2026 Gestionale Clinica Aziendale — email generata automaticamente
  </div>
</div>
</body></html>
"""


def build_email_conferma(paziente_nome: str, medico_nome: str, orario: str, stanza: str) -> str:
    body = f"""\
    <p style="color:#374151;margin-bottom:16px">la sua prenotazione è stata <strong>confermata</strong> con successo.</p>
    <div class="detail-row"><span class="icon">📅</span>
      <div><div class="label">Data e Ora</div><div class="value">{orario}</div></div></div>
    <div class="detail-row"><span class="icon">👨‍⚕️</span>
      <div><div class="label">Medico</div><div class="value">{medico_nome}</div></div></div>
    <div class="detail-row"><span class="icon">🚪</span>
      <div><div class="label">Stanza</div><div class="value">{stanza}</div></div></div>
    <p style="color:#6c757d;font-size:.85rem;margin-top:20px">
      Se necessita di cancellare o modificare l'appuntamento, contatti la segreteria.</p>
    """
    return _BASE_TEMPLATE.format(
        subtitle="Conferma Prenotazione",
        paziente_nome=paziente_nome,
        body_content=body,
    )


def build_email_promemoria(paziente_nome: str, medico_nome: str, orario: str, stanza: str) -> str:
    body = f"""\
    <p style="color:#374151;margin-bottom:16px">
      le ricordiamo il suo appuntamento in programma per <strong>domani</strong>.</p>
    <div class="detail-row"><span class="icon">📅</span>
      <div><div class="label">Data e Ora</div><div class="value">{orario}</div></div></div>
    <div class="detail-row"><span class="icon">👨‍⚕️</span>
      <div><div class="label">Medico</div><div class="value">{medico_nome}</div></div></div>
    <div class="detail-row"><span class="icon">🚪</span>
      <div><div class="label">Stanza</div><div class="value">{stanza}</div></div></div>
    <p style="color:#6c757d;font-size:.85rem;margin-top:20px">
      Si presenti <strong>10 minuti prima</strong> dell'orario indicato.</p>
    """
    return _BASE_TEMPLATE.format(
        subtitle="Promemoria Appuntamento",
        paziente_nome=paziente_nome,
        body_content=body,
    )


def build_email_disponibilita(paziente_nome: str, med_nome: str) -> str:
    body = f"""
    <p style="color:#374151;margin-bottom:16px">
      siamo lieti di comunicarle che si è liberato un <strong>posto disponibile</strong>
      con <strong>{med_nome}</strong>.</p>
    <div class="detail-row"><span class="icon">📞</span>
      <div><div class="label">Come procedere</div>
      <div class="value">Contatti la segreteria per confermare l'appuntamento</div></div></div>
    <div class="detail-row"><span class="icon">⏰</span>
      <div><div class="label">Importante</div>
      <div class="value">Il posto è disponibile per un periodo limitato</div></div></div>
    <p style="color:#6c757d;font-size:.85rem;margin-top:20px">
      Se non è più interessato, può ignorare questa email. Il posto sarà assegnato
      al prossimo paziente in lista d'attesa.</p>
    """
    return _BASE_TEMPLATE.format(
        subtitle="Posto Disponibile — Lista d'Attesa",
        paziente_nome=paziente_nome,
        body_content=body,
    )
