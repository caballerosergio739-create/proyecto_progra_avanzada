# Telegram Tracker Bot & Dashboard

Un bot de notificaciones para Telegram con un dashboard web minimalista diseñado para rastrear cambios en páginas web (precios, stock, estados) y alertarte directamente en tu móvil.

## 🚀 Tecnologías

*   **Backend:** Python, FastAPI, SQLite, SQLAlchemy, APScheduler, BeautifulSoup4
*   **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (Vibe-coding style)

## 📋 Requisitos Previos

*   Python 3.9+
*   Cuenta de Telegram

## ⚙️ Configuración de Telegram (BotFather)

1. Abre Telegram y busca **@BotFather**.
2. Envía el comando `/newbot` y sigue las instrucciones para darle un nombre y un username a tu bot.
3. BotFather te entregará un **Token HTTP API** (ej. `123456789:ABCDefghIJKLmnopQRSTuvwxYZ`). Guárdalo.
4. Inicia un chat con tu nuevo bot (busca su username) y presiona "Iniciar" (o envía `/start`).
5. Para obtener tu **Chat ID**, puedes reenviar un mensaje tuyo a `@userinfobot` o visitar `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` tras enviarle un mensaje a tu bot, y buscar el campo `"chat": {"id": ...}`.

## 💻 Instalación y Uso

1. **Clonar el repositorio**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd telegram-tracker-bot
   ```

2. **Configurar el Backend**
   ```bash
   cd backend
   python -m venv venv
   # En Windows: venv\Scripts\activate
   # En macOS/Linux: source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Ejecutar el Servidor**
   ```bash
   uvicorn app.main:app --reload
   ```
   El backend y el dashboard web estarán disponibles en `http://localhost:8000`.

## 🤝 Flujo de Trabajo en Git (Colaboración)

Para trabajar en equipo, sigue este flujo estándar:
1. Asegúrate de estar en la rama principal y actualizado: `git checkout main` && `git pull`
2. Crea una rama para tu nueva funcionalidad: `git checkout -b feature/nueva-funcionalidad`
3. Haz tus cambios, añade los archivos y crea commits descriptivos: `git commit -m "feat: añade scraping para sitio X"`
4. Sube tu rama: `git push origin feature/nueva-funcionalidad`
5. Crea un Pull Request en GitHub.
