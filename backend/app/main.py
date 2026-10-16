import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl
from typing import List, Optional

from .database import get_db, TrackedURL, Config, Log, User
from .scheduler import start_scheduler, shutdown_scheduler, check_urls
from .telegram import send_telegram_message

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    shutdown_scheduler()

app = FastAPI(title="Telegram Tracker Bot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic
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
        from_attributes = True

class ConfigUpdate(BaseModel):
    telegram_token: str
    telegram_chat_id: str

class LogResponse(BaseModel):
    id: int
    message: str
    timestamp: str
    status: str

    class Config:
        from_attributes = True

class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# Helper: obtener user_id del header (None si no hay sesión)
def get_user_id(x_user_id: Optional[str] = Header(default=None)) -> Optional[int]:
    if x_user_id and x_user_id.isdigit():
        return int(x_user_id)
    return None

# ----- AUTH ENDPOINTS -----

@app.post("/api/register")
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya esta registrado")
    new_user = User(name=user_in.name, email=user_in.email)
    new_user.set_password(user_in.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "name": new_user.name, "email": new_user.email}

@app.post("/api/login")
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not user.check_password(user_in.password):
        raise HTTPException(status_code=401, detail="Correo o contrasena incorrectos")
    return {"id": user.id, "name": user.name, "email": user.email}

# ----- URLS ENDPOINTS (filtradas por usuario) -----

@app.get("/api/urls", response_model=List[URLResponse])
def get_urls(user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    # Si no hay sesión, devolver lista vacía
    if user_id is None:
        return []
    urls = db.query(TrackedURL).filter(TrackedURL.user_id == user_id).all()
    result = []
    for u in urls:
        result.append({
            "id": u.id, "name": u.name, "url": u.url, "css_selector": u.css_selector,
            "last_value": u.last_value, "is_active": u.is_active, "error_state": u.error_state,
            "last_checked": u.last_checked.isoformat() if u.last_checked else None
        })
    return result

@app.post("/api/urls", response_model=URLResponse)
def create_url(url_in: URLCreate, user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    if user_id is None:
        raise HTTPException(status_code=401, detail="Debes iniciar sesion para agregar rastreadores")
    new_url = TrackedURL(
        user_id=user_id,
        name=url_in.name,
        url=str(url_in.url),
        css_selector=url_in.css_selector
    )
    db.add(new_url)
    db.commit()
    db.refresh(new_url)
    return {**new_url.__dict__, "last_checked": None}

@app.delete("/api/urls/{url_id}")
def delete_url(url_id: int, user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    query = db.query(TrackedURL).filter(TrackedURL.id == url_id)
    if user_id is not None:
        query = query.filter(TrackedURL.user_id == user_id)
    url_item = query.first()
    if not url_item:
        raise HTTPException(status_code=404, detail="URL no encontrada")
    db.delete(url_item)
    db.commit()
    return {"message": "URL eliminada"}

@app.post("/api/urls/{url_id}/toggle")
def toggle_url(url_id: int, user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    query = db.query(TrackedURL).filter(TrackedURL.id == url_id)
    if user_id is not None:
        query = query.filter(TrackedURL.user_id == user_id)
    url_item = query.first()
    if not url_item:
        raise HTTPException(status_code=404, detail="URL no encontrada")
    url_item.is_active = not url_item.is_active
    db.commit()
    return {"message": "Estado cambiado", "is_active": url_item.is_active}

# ----- CONFIG -----

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
    return {"message": "Configuracion guardada"}

@app.post("/api/test-telegram")
def test_telegram(user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    config = db.query(Config).first()
    if not config or not config.telegram_token or not config.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Configuracion incompleta")
    success = send_telegram_message(
        config.telegram_token,
        config.telegram_chat_id,
        "✅ *Mensaje de prueba* desde Telegram Tracker Bot",
        db,
        user_id=user_id
    )
    if not success:
        raise HTTPException(status_code=500, detail="Error enviando mensaje")
    return {"message": "Mensaje enviado exitosamente"}

@app.post("/api/force-check")
def force_check():
    check_urls()
    return {"message": "Chequeo manual finalizado"}

# ----- LOGS (filtrados por usuario) -----

@app.get("/api/logs")
def get_logs(user_id: Optional[int] = Depends(get_user_id), db: Session = Depends(get_db)):
    if user_id is None:
        return []
    logs = db.query(Log).filter(Log.user_id == user_id).order_by(Log.timestamp.desc()).limit(50).all()
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
