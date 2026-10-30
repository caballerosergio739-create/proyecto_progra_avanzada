import os
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS

from .database import SessionLocal, TrackedURL, Config, Log, User
from .scheduler import start_scheduler, shutdown_scheduler, check_urls
from .telegram import send_telegram_message

# Rutas del Frontend (React en dist)
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")
SERVE_DIR = DIST_DIR if os.path.exists(DIST_DIR) else FRONTEND_DIR

app = Flask(__name__, static_folder=SERVE_DIR)
CORS(app)

# Iniciar planificador en segundo plano
start_scheduler()

# Helper para sesión de base de datos en Flask
def get_db():
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

@app.teardown_appcontext
def teardown_db(exception=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# Helper: obtener user_id del header X-User-ID
def get_user_id():
    x_user_id = request.headers.get("X-User-ID")
    if not x_user_id:
        return None
    try:
        val = str(x_user_id).strip()
        if val.isdigit():
            return int(val)
    except Exception:
        pass
    return None

# ====================================================
# AUTH ENDPOINTS
# ====================================================

@app.route("/api/register", methods=["POST"])
def register():
    db = get_db()
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({"detail": "Todos los campos son obligatorios"}), 400

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return jsonify({"detail": "El correo ya esta registrado"}), 400

    new_user = User(name=name, email=email)
    new_user.set_password(password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return jsonify({"id": new_user.id, "name": new_user.name, "email": new_user.email}), 200

@app.route("/api/login", methods=["POST"])
def login():
    db = get_db()
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.check_password(password):
        return jsonify({"detail": "Correo o contrasena incorrectos"}), 401

    return jsonify({"id": user.id, "name": user.name, "email": user.email}), 200

# ====================================================
# URLS ENDPOINTS (Filtradas por usuario)
# ====================================================

@app.route("/api/urls", methods=["GET"])
def get_urls():
    db = get_db()
    user_id = get_user_id()
    if user_id is not None:
        urls = db.query(TrackedURL).filter(TrackedURL.user_id == user_id).all()
    else:
        urls = db.query(TrackedURL).filter(TrackedURL.user_id == None).all()

    result = []
    for u in urls:
        result.append({
            "id": u.id,
            "name": u.name,
            "url": u.url,
            "css_selector": u.css_selector,
            "last_value": u.last_value,
            "is_active": u.is_active,
            "error_state": u.error_state or False,
            "last_checked": u.last_checked.isoformat() if u.last_checked else None
        })
    return jsonify(result), 200

@app.route("/api/urls", methods=["POST"])
def create_url():
    db = get_db()
    user_id = get_user_id()
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    url_str = data.get("url", "").strip()
    css_selector = data.get("css_selector", "").strip()

    if not name or not url_str or not css_selector:
        return jsonify({"detail": "Todos los campos son obligatorios"}), 400

    if not url_str.startswith("http://") and not url_str.startswith("https://"):
        url_str = "https://" + url_str

    new_url = TrackedURL(
        user_id=user_id,
        name=name,
        url=url_str,
        css_selector=css_selector,
        is_active=True,
        error_state=False
    )
    db.add(new_url)
    db.commit()
    db.refresh(new_url)

    return jsonify({
        "id": new_url.id,
        "name": new_url.name,
        "url": new_url.url,
        "css_selector": new_url.css_selector,
        "last_value": new_url.last_value,
        "is_active": new_url.is_active,
        "last_checked": None,
        "error_state": False
    }), 200

@app.route("/api/urls/<int:url_id>", methods=["DELETE"])
def delete_url(url_id):
    db = get_db()
    user_id = get_user_id()
    query = db.query(TrackedURL).filter(TrackedURL.id == url_id)
    if user_id is not None:
        query = query.filter(TrackedURL.user_id == user_id)
    else:
        query = query.filter(TrackedURL.user_id == None)

    url_item = query.first()
    if not url_item:
        return jsonify({"detail": "URL no encontrada"}), 404

    db.delete(url_item)
    db.commit()
    return jsonify({"message": "URL eliminada"}), 200

@app.route("/api/urls/<int:url_id>/toggle", methods=["POST"])
def toggle_url(url_id):
    db = get_db()
    user_id = get_user_id()
    query = db.query(TrackedURL).filter(TrackedURL.id == url_id)
    if user_id is not None:
        query = query.filter(TrackedURL.user_id == user_id)
    else:
        query = query.filter(TrackedURL.user_id == None)

    url_item = query.first()
    if not url_item:
        return jsonify({"detail": "URL no encontrada"}), 404

    url_item.is_active = not url_item.is_active
    db.commit()
    return jsonify({"message": "Estado cambiado", "is_active": url_item.is_active}), 200

# ====================================================
# CONFIG ENDPOINTS
# ====================================================

@app.route("/api/config", methods=["GET"])
def get_config():
    db = get_db()
    user_id = get_user_id()
    if user_id is not None:
        config = db.query(Config).filter(Config.user_id == user_id).first()
    else:
        config = db.query(Config).filter(Config.user_id == None).first()

    if not config:
        return jsonify({"telegram_token": "", "telegram_chat_id": ""}), 200
    return jsonify({
        "telegram_token": config.telegram_token or "",
        "telegram_chat_id": config.telegram_chat_id or ""
    }), 200

@app.route("/api/config", methods=["POST"])
def update_config():
    db = get_db()
    user_id = get_user_id()
    data = request.get_json() or {}
    token = data.get("telegram_token", "").strip()
    chat_id = data.get("telegram_chat_id", "").strip()

    if user_id is not None:
        config = db.query(Config).filter(Config.user_id == user_id).first()
    else:
        config = db.query(Config).filter(Config.user_id == None).first()

    if not config:
        config = Config(
            user_id=user_id,
            telegram_token=token,
            telegram_chat_id=chat_id
        )
        db.add(config)
    else:
        config.telegram_token = token
        config.telegram_chat_id = chat_id
    db.commit()
    return jsonify({"message": "Configuracion guardada"}), 200

@app.route("/api/test-telegram", methods=["POST"])
def test_telegram():
    db = get_db()
    user_id = get_user_id()
    if user_id is not None:
        config = db.query(Config).filter(Config.user_id == user_id).first()
    else:
        config = db.query(Config).filter(Config.user_id == None).first()

    if not config or not config.telegram_token or not config.telegram_chat_id:
        return jsonify({"detail": "Configuracion incompleta. Guarda el Token y Chat ID primero."}), 400

    success = send_telegram_message(
        config.telegram_token,
        config.telegram_chat_id,
        "✅ *Mensaje de prueba* desde Telegram Tracker Bot",
        db,
        user_id=user_id
    )
    if not success:
        return jsonify({"detail": "Error enviando mensaje"}), 500
    return jsonify({"message": "Mensaje enviado exitosamente"}), 200

@app.route("/api/force-check", methods=["POST"])
def force_check():
    check_urls()
    return jsonify({"message": "Chequeo manual finalizado"}), 200

# ====================================================
# LOGS ENDPOINTS
# ====================================================

@app.route("/api/logs", methods=["GET"])
def get_logs():
    db = get_db()
    user_id = get_user_id()
    if user_id is not None:
        logs = db.query(Log).filter(Log.user_id == user_id).order_by(Log.timestamp.desc()).limit(50).all()
    else:
        logs = db.query(Log).filter(Log.user_id == None).order_by(Log.timestamp.desc()).limit(50).all()

    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "message": log.message,
            "timestamp": log.timestamp.isoformat(),
            "status": log.status
        })
    return jsonify(result), 200

# ====================================================
# SERVIR EL FRONTEND (REACT / DIST)
# ====================================================

@app.route("/")
@app.route("/login")
@app.route("/register")
def serve_index():
    index_path = os.path.join(SERVE_DIR, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(SERVE_DIR, "index.html")
    return jsonify({"error": "Frontend no encontrado"}), 404

@app.route("/<path:path>")
def serve_static(path):
    file_path = os.path.join(SERVE_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(SERVE_DIR, path)
    # Fallback para rutas cliente de React
    return send_from_directory(SERVE_DIR, "index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
