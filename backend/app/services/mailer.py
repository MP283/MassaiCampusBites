"""Email sending via SMTP. When SMTP_HOST is not set, emails are printed to the server console."""
import smtplib
import ssl
from email.message import EmailMessage

from .. import config


def configured() -> bool:
    return bool(config.SMTP_HOST)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not configured():
        bar = "=" * 70
        print(f"\n{bar}\n[mail] (console mode - set SMTP_HOST to send real email)\nTo: {to}\nSubject: {subject}\n\n{text}\n{bar}\n")
        return False
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        if config.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=ssl.create_default_context(), timeout=20) as s:
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
                s.starttls(context=ssl.create_default_context())
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASS)
                s.send_message(msg)
        print(f"[mail] sent '{subject}' to {to}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[mail] FAILED to send to {to}: {exc}\n{text}")
        return False


def _html(title, body_lines, button_text=None, button_url=None):
    body = "".join(f"<p style='margin:0 0 12px'>{line}</p>" for line in body_lines)
    button = (
        f"<p><a href='{button_url}' style='background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;"
        f"text-decoration:none;display:inline-block'>{button_text}</a></p>" if button_url else ""
    )
    return (f"<div style='font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937'>"
            f"<h2 style='color:#4f46e5'>{title}</h2>{body}{button}"
            f"<p style='color:#6b7280;font-size:12px'>Sent by AI Test Platform</p></div>")


def send_invite(email, team_name, admin_name, institution, link):
    org = institution or admin_name
    text = (f"Hello,\n\n{admin_name} ({org}) has invited you to join the team \"{team_name}\" on AI Test Platform.\n\n"
            f"Accept the invitation and set your password here:\n{link}\n\nIf you weren't expecting this, ignore this email.")
    html = _html("You're invited!", [f"<b>{admin_name}</b> ({org}) has invited you to join the team <b>{team_name}</b>.",
                                     "Click below to accept and set your password."], "Accept invitation", link)
    return send_email(email, f"Invitation to join {team_name}", text, html)


def send_credentials(email, name, team_name, admin_name, temp_password, login_url):
    text = (f"Hello {name},\n\n{admin_name} has created an account for you in team \"{team_name}\".\n\n"
            f"Login: {login_url}\nEmail: {email}\nTemporary password: {temp_password}\n\n"
            "You will be asked to change your password after the first login.")
    html = _html("Your student account", [f"Hello {name},", f"<b>{admin_name}</b> created an account for you in team <b>{team_name}</b>.",
                                          f"Email: <b>{email}</b><br>Temporary password: <b>{temp_password}</b>",
                                          "You'll be asked to change it after your first login."], "Log in", login_url)
    return send_email(email, "Your AI Test Platform account", text, html)


def send_test_assigned(email, name, test_title, link):
    text = f"Hello {name},\n\nA new test \"{test_title}\" has been assigned to you.\nOpen your dashboard: {link}"
    html = _html("New test assigned", [f"Hello {name},", f"A new test <b>{test_title}</b> has been assigned to you."], "Open dashboard", link)
    return send_email(email, f"New test: {test_title}", text, html)
