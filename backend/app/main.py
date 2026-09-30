import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl
from typing import List, Optional

from .database import get_db, TrackedURL, Config, Log
from .scheduler import start_scheduler, shutdown_scheduler, check_urls
from .telegram import send_telegram_message

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    yield
    # Shutdown
    shutdown_scheduler()

app = FastAPI(title="Telegram Tracker Bot API", lifespan=lifespan)

# CORS (por si el frontend se sirve desde otro origen durante el desarrollo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic para la API
class URLCreate(BaseModel):
    name: str
    url: HttpUrl
    css_selector: str

class URLResponse(BaseModel):
    id: int
    name: str
    url: str
    css_selector: str
    last_value: Optional[str]
    is_active: bool
    last_checked: Optional[str]
    error_state: bool

    class Config:
        orm_mode = True

class ConfigUpdate(BaseModel):
    telegram_token: str
    telegram_chat_id: str

class LogResponse(BaseModel):
    id: int
    message: str
    timestamp: str
    status: str
    
    class Config:
        orm_mode = True

# ----- ENDPOINTS -----

@app.get("/api/urls", response_model=List[URLResponse])
def get_urls(db: Session = Depends(get_db)):
    urls = db.query(TrackedURL).all()
    # Formatear fecha
    result = []
    for u in urls:
        u_dict = {
            "id": u.id, "name": u.name, "url": u.url, "css_selector": u.css_selector,
            "last_value": u.last_value, "is_active": u.is_active, "error_state": u.error_state,
            "last_checked": u.last_checked.isoformat() if u.last_checked else None
        }
        result.append(u_dict)
    return result

@app.post("/api/urls", response_model=URLResponse)
def create_url(url_in: URLCreate, db: Session = Depends(get_db)):
    new_url = TrackedURL(
        name=url_in.name,
        url=str(url_in.url),
        css_selector=url_in.css_selector
    )
    db.add(new_url)
    db.commit()
    db.refresh(new_url)
    return {**new_url.__dict__, "last_checked": None}

@app.delete("/api/urls/{url_id}")
def delete_url(url_id: int, db: Session = Depends(get_db)):
    url_item = db.query(TrackedURL).filter(TrackedURL.id == url_id).first()
    if not url_item:
        raise HTTPException(status_code=404, detail="URL no encontrada")
    db.delete(url_item)
    db.commit()
    return {"message": "URL eliminada"}

@app.post("/api/urls/{url_id}/toggle")
def toggle_url(url_id: int, db: Session = Depends(get_db)):
    url_item = db.query(TrackedURL).filter(TrackedURL.id == url_id).first()
    if not url_item:
        raise HTTPException(status_code=404, detail="URL no encontrada")
    url_item.is_active = not url_item.is_active
    db.commit()
    return {"message": "Estado cambiado", "is_active": url_item.is_active}

@app.get("/api/config")
def get_config(db: Session = Depends(get_db)):
    config = db.query(Config).first()
    if not config:
        return {"telegram_token": "", "telegram_chat_id": ""}
    return {"telegram_token": config.telegram_token, "telegram_chat_id": config.telegram_chat_id}

@app.post("/api/config")
def update_config(config_in: ConfigUpdate, db: Session = Depends(get_db)):
    config = db.query(Config).first()
    if not config:
        config = Config(telegram_token=config_in.telegram_token, telegram_chat_id=config_in.telegram_chat_id)
        db.add(config)
    else:
        config.telegram_token = config_in.telegram_token
        config.telegram_chat_id = config_in.telegram_chat_id
    db.commit()
    return {"message": "Configuración guardada"}

@app.post("/api/test-telegram")
def test_telegram(db: Session = Depends(get_db)):
    config = db.query(Config).first()
    if not config or not config.telegram_token or not config.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Configuración incompleta")
    
    success = send_telegram_message(
        config.telegram_token, 
        config.telegram_chat_id, 
        "✅ *Mensaje de prueba* desde Telegram Tracker Bot", 
        db
    )
    if not success:
        raise HTTPException(status_code=500, detail="Error enviando mensaje")
    return {"message": "Mensaje enviado exitosamente"}

@app.post("/api/force-check")
def force_check():
    """Ejecuta el job del scheduler manualmente de forma síncrona/inmediata."""
    check_urls()
    return {"message": "Chequeo manual finalizado"}

@app.get("/api/logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(Log).order_by(Log.timestamp.desc()).limit(50).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "message": log.message,
            "timestamp": log.timestamp.isoformat(),
            "status": log.status
        })
    return result

# ----- SERVIR EL FRONTEND -----
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")

@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend no encontrado"}

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")
