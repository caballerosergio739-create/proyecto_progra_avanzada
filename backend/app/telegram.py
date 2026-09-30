import requests
from typing import Optional
from sqlalchemy.orm import Session
from .database import Log

def send_telegram_message(token: str, chat_id: str, text: str, db: Optional[Session] = None) -> bool:
    """
    Envía un mensaje de Telegram usando la API HTTP oficial.
    Si se provee una sesión de BD, registra el evento en los logs.
    """
    if not token or not chat_id:
        print("Telegram Config faltante. No se puede enviar el mensaje.")
        return False
        
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    
    status = "error"
    try:
        response = requests.post(url, json=payload, timeout=5)
        response.raise_for_status()
        status = "success"
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error al enviar mensaje de Telegram: {e}")
        return False
    finally:
        # Guardar log en BD
        if db:
            log_entry = Log(message=text, status=status)
            db.add(log_entry)
            db.commit()
