const API_BASE = '/api';

// Elementos DOM
const urlsList = document.getElementById('urlsList');
const logsList = document.getElementById('logsList');
const addUrlForm = document.getElementById('addUrlForm');
const configForm = document.getElementById('configForm');
const forceCheckBtn = document.getElementById('forceCheckBtn');
const testMsgBtn = document.getElementById('testMsgBtn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const toastIcon = document.getElementById('toastIcon');

// Utilidad para mostrar notificaciones Toast
function showToast(message, type = 'success') {
    toastMsg.textContent = message;
    if (type === 'success') {
        toastIcon.className = 'ph-fill ph-check-circle text-green-400 text-xl';
        toast.classList.replace('bg-red-900/90', 'bg-gray-800');
        toast.classList.replace('border-red-500', 'border-gray-700');
    } else {
        toastIcon.className = 'ph-fill ph-warning-circle text-red-400 text-xl';
        toast.classList.replace('bg-gray-800', 'bg-red-900/90');
        toast.classList.replace('border-gray-700', 'border-red-500');
    }
    
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// Cargar Configuración de Telegram
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        const data = await res.json();
        document.getElementById('telegramToken').value = data.telegram_token || '';
        document.getElementById('telegramChatId').value = data.telegram_chat_id || '';
    } catch (err) {
        console.error("Error al cargar configuración", err);
    }
}

// Guardar Configuración
configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('telegramToken').value;
    const chatId = document.getElementById('telegramChatId').value;
    
    try {
        const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_token: token, telegram_chat_id: chatId })
        });
        if (res.ok) showToast("Configuración guardada correctamente");
        else showToast("Error al guardar configuración", "error");
    } catch (err) {
        showToast("Error de red", "error");
    }
});

// Enviar Mensaje de Prueba
testMsgBtn.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/test-telegram`, { method: 'POST' });
        if (res.ok) {
            showToast("Mensaje de prueba enviado a Telegram");
            loadLogs(); // Actualizar logs
        } else {
            const err = await res.json();
            showToast(err.detail || "Error al enviar mensaje", "error");
        }
    } catch (err) {
        showToast("Error de red", "error");
    }
});

// Cargar URLs monitoreadas
async function loadURLs() {
    try {
        const res = await fetch(`${API_BASE}/urls`);
        const urls = await res.json();
        
        if (urls.length === 0) {
            urlsList.innerHTML = `
                <div class="text-center py-10 text-gray-500 border border-dashed border-gray-800 rounded-xl">
                    No hay URLs monitoreadas. Añade una arriba.
                </div>
            `;
            return;
        }
        
        urlsList.innerHTML = urls.map(url => `
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-1">
                        <div class="${url.error_state ? 'status-error-dot' : (url.is_active ? 'status-active-dot' : 'w-2 h-2 bg-gray-600 rounded-full')}"></div>
                        <h3 class="font-semibold text-white truncate" title="${url.name}">${url.name}</h3>
                        ${url.error_state ? '<span class="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full border border-red-800">Error Scrapeo</span>' : ''}
                        ${!url.is_active ? '<span class="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Pausado</span>' : ''}
                    </div>
                    <a href="${url.url}" target="_blank" class="text-xs text-telegram hover:underline truncate block mb-2">${url.url}</a>
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div class="bg-gray-950 rounded-lg p-2 border border-gray-800">
                            <span class="block text-[10px] text-gray-500 mb-1">Último Valor:</span>
                            <span class="text-sm font-mono text-gray-300 break-all">${url.last_value || '<em>N/A</em>'}</span>
                        </div>
                        <div class="bg-gray-950 rounded-lg p-2 border border-gray-800">
                            <span class="block text-[10px] text-gray-500 mb-1">Selector CSS:</span>
                            <span class="text-xs font-mono text-gray-400 break-all">${url.css_selector}</span>
                        </div>
                    </div>
                    <div class="text-[10px] text-gray-500 mt-2">
                        Última revisión: ${url.last_checked ? new Date(url.last_checked).toLocaleString() : 'Nunca'}
                    </div>
                </div>
                
                <div class="flex md:flex-col gap-2 w-full md:w-auto">
                    <button onclick="toggleUrl(${url.id})" class="flex-1 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors border border-gray-700 flex items-center justify-center" title="${url.is_active ? 'Pausar' : 'Activar'}">
                        <i class="${url.is_active ? 'ph ph-pause' : 'ph ph-play'} text-lg"></i>
                    </button>
                    <button onclick="deleteUrl(${url.id})" class="flex-1 bg-gray-800 hover:bg-red-900/50 text-red-400 p-2 rounded-lg transition-colors border border-gray-700 hover:border-red-800 flex items-center justify-center" title="Eliminar">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Error cargando URLs", err);
    }
}

// Añadir URL
addUrlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById('urlName').value,
        url: document.getElementById('urlLink').value,
        css_selector: document.getElementById('cssSelector').value
    };
    
    try {
        const res = await fetch(`${API_BASE}/urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("URL añadida al monitoreo");
            addUrlForm.reset();
            loadURLs();
        }
    } catch (err) {
        showToast("Error al añadir URL", "error");
    }
});

// Eliminar URL
window.deleteUrl = async (id) => {
    if(!confirm("¿Seguro que deseas eliminar este rastreador?")) return;
    try {
        const res = await fetch(`${API_BASE}/urls/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Rastreador eliminado");
            loadURLs();
        }
    } catch (err) {
        showToast("Error al eliminar", "error");
    }
};

// Pausar/Reanudar URL
window.toggleUrl = async (id) => {
    try {
        const res = await fetch(`${API_BASE}/urls/${id}/toggle`, { method: 'POST' });
        if (res.ok) loadURLs();
    } catch (err) {
        showToast("Error al cambiar estado", "error");
    }
};

// Cargar Logs
async function loadLogs() {
    try {
        const res = await fetch(`${API_BASE}/logs`);
        const logs = await res.json();
        
        if (logs.length === 0) {
            logsList.innerHTML = `<div class="text-gray-500 text-center py-4">No hay notificaciones enviadas aún.</div>`;
            return;
        }
        
        logsList.innerHTML = logs.map(log => `
            <div class="border-l-2 ${log.status === 'success' ? 'border-green-500' : 'border-red-500'} pl-3 py-1">
                <div class="text-[10px] text-gray-500 flex justify-between">
                    <span>${new Date(log.timestamp).toLocaleString()}</span>
                    <span class="${log.status === 'success' ? 'text-green-500' : 'text-red-500'} uppercase font-bold">${log.status}</span>
                </div>
                <div class="text-gray-300 mt-1 whitespace-pre-wrap">${log.message.substring(0, 100)}${log.message.length > 100 ? '...' : ''}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Error cargando logs", err);
    }
}

// Probar actualización manual
forceCheckBtn.addEventListener('click', async () => {
    const originalText = forceCheckBtn.innerHTML;
    forceCheckBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Revisando...`;
    forceCheckBtn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/force-check`, { method: 'POST' });
        if (res.ok) {
            showToast("Revisión manual completada");
            loadURLs();
            loadLogs();
        } else {
            showToast("Error en la revisión", "error");
        }
    } catch (err) {
        showToast("Error de red", "error");
    } finally {
        forceCheckBtn.innerHTML = originalText;
        forceCheckBtn.disabled = false;
    }
});

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadURLs();
    loadLogs();
    
    // Auto-refresh cada 30 segundos
    setInterval(() => {
        loadURLs();
        loadLogs();
    }, 30000);
});
