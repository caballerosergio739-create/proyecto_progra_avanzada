from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from datetime import datetime

from .database import SessionLocal, TrackedURL, Config
from .scraper import scrape_url
from .telegram import send_telegram_message

scheduler = BackgroundScheduler()

def check_urls():
    """
    Tarea principal que itera sobre todas las URLs activas, las hace scrape,
    compara con el último valor y envía notificación si hay cambio.
    """
    db = SessionLocal()
    try:
        # Obtener configuración de Telegram
        config = db.query(Config).first()
        if not config or not config.telegram_token or not config.telegram_chat_id:
            print("Scheduler: Configuración de Telegram incompleta. Saltando chequeo.")
            return

        urls_to_check = db.query(TrackedURL).filter(TrackedURL.is_active == True).all()
        
        for item in urls_to_check:
            print(f"[{datetime.now()}] Chequeando: {item.name} ({item.url})")
            
            scraped_value = scrape_url(item.url, item.css_selector)
            item.last_checked = datetime.utcnow()
            
            if scraped_value is None:
                item.error_state = True
                db.commit()
                continue
                
            item.error_state = False
            
            # Si es la primera vez que se scrapea o el valor cambió
            if item.last_value != scraped_value:
                old_value = item.last_value
                item.last_value = scraped_value
                db.commit()
                
                # Enviar notificación
                message = f"🔔 *Alerta de Cambio: {item.name}*\n\n"
                message += f"Nuevo valor encontrado:\n`{scraped_value}`\n\n"
                if old_value:
                    message += f"Valor anterior: `{old_value}`\n\n"
                message += f"[Ver Página]({item.url})"
                
                send_telegram_message(
                    token=config.telegram_token,
                    chat_id=config.telegram_chat_id,
                    text=message,
                    db=db
                )
            else:
                db.commit()
                print(f"Sin cambios para {item.name}")
                
    except Exception as e:
        print(f"Error en el scheduler: {e}")
    finally:
        db.close()

def start_scheduler():
    """Inicia el planificador en segundo plano."""
    if not scheduler.running:
        # Ejecutar cada 15 minutos (900 segundos)
        scheduler.add_job(
            check_urls,
            trigger=IntervalTrigger(minutes=15),
            id='check_urls_job',
            name='Chequeo periódico de URLs',
            replace_existing=True
        )
        scheduler.start()
        print("Scheduler iniciado. Revisará cada 15 minutos.")

def shutdown_scheduler():
    """Detiene el planificador."""
    if scheduler.running:
        scheduler.shutdown()
        print("Scheduler detenido.")
