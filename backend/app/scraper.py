import requests
from bs4 import BeautifulSoup
import random

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
]

def scrape_url(url: str, css_selector: str) -> str:
    """
    Realiza una petición HTTP a la URL y extrae el texto del primer elemento que coincida con el selector CSS.
    Incluye cookies para saltar restricciones de edad (ej. Steam).
    """
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8"
    }
    
    # Cookies específicas para evadir restricciones de edad en Steam
    cookies_steam = {
        'birthtime': '283993201',
        'lastagecheckage': '1-0-1989'
    }
    
    try:
        response = requests.get(url, headers=headers, cookies=cookies_steam, timeout=10)
        response.raise_for_status() # Lanza excepción si hay un error HTTP
        
        soup = BeautifulSoup(response.text, "html.parser")
        element = soup.select_one(css_selector)
        
        if element:
            # Extraemos texto limpio, quitando espacios extra
            return " ".join(element.text.split())
        else:
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error HTTP extrayendo {url}: {e}")
        return None
    except Exception as e:
        print(f"Error inesperado extrayendo {url}: {e}")
        return None
