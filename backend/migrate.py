"""
Script de migracion: Anade la columna user_id a tracked_urls y logs,
y asigna los registros existentes al usuario caballerosergio739@gmail.com.
Ejecutar UNA SOLA VEZ con: python migrate.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "tracker.db")
TARGET_EMAIL = "caballerosergio739@gmail.com"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. Anadir columna user_id a tracked_urls si no existe
try:
    cur.execute("ALTER TABLE tracked_urls ADD COLUMN user_id INTEGER")
    print("[OK] Columna user_id anadida a tracked_urls")
except sqlite3.OperationalError:
    print("[INFO] Columna user_id ya existe en tracked_urls")

# 2. Anadir columna user_id a logs si no existe
try:
    cur.execute("ALTER TABLE logs ADD COLUMN user_id INTEGER")
    print("[OK] Columna user_id anadida a logs")
except sqlite3.OperationalError:
    print("[INFO] Columna user_id ya existe en logs")

# 3. Buscar el usuario con el correo objetivo
cur.execute("SELECT id FROM users WHERE email = ?", (TARGET_EMAIL,))
row = cur.fetchone()

if row:
    user_id = row[0]
    cur.execute("UPDATE tracked_urls SET user_id = ? WHERE user_id IS NULL", (user_id,))
    cur.execute("UPDATE logs SET user_id = ? WHERE user_id IS NULL", (user_id,))
    conn.commit()
    print(f"[OK] Registros existentes asignados al usuario ID={user_id} ({TARGET_EMAIL})")
else:
    conn.commit()
    print(f"[AVISO] No se encontro el usuario '{TARGET_EMAIL}'.")
    print("   Crea la cuenta primero desde el formulario de registro.")

conn.close()
print("Migracion completada.")
