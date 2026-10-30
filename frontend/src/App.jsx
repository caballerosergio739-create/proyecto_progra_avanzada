import React, { useState, useEffect, useRef } from 'react';

const API_BASE = '/api';

export default function App() {
  // Navigation / View State
  const [currentView, setCurrentView] = useState(() => {
    const path = window.location.pathname;
    if (path === '/login') return 'login';
    if (path === '/register') return 'register';
    return 'dashboard';
  });

  // User Authentication State
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  // User Dropdown State
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Dashboard Data State
  const [urls, setUrls] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Forms State
  const [urlForm, setUrlForm] = useState({ name: '', url: '', css_selector: '' });
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);

  const [configForm, setConfigForm] = useState({ telegram_token: '', telegram_chat_id: '' });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Auth Forms State
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '' });
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Toast Notification State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3200);
  };

  // Helper for authenticated requests
  const getAuthHeaders = (extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    if (user && user.id) {
      headers['X-User-ID'] = String(user.id);
    }
    return headers;
  };

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/login') setCurrentView('login');
      else if (path === '/register') setCurrentView('register');
      else setCurrentView('dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view) => {
    setCurrentView(view);
    const path = view === 'dashboard' ? '/' : `/${view}`;
    window.history.pushState(null, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setUserDropdownOpen(false);
    setConfigForm({ telegram_token: '', telegram_chat_id: '' });
    setUrls([]);
    setLogs([]);
    showToast('Sesión cerrada correctamente');
    navigateTo('dashboard');
  };

  // Fetch Config
  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfigForm({
          telegram_token: data.telegram_token || '',
          telegram_chat_id: data.telegram_chat_id || ''
        });
      }
    } catch (err) {
      console.error('Error cargando configuración:', err);
    }
  };

  // Fetch Tracked URLs
  const loadUrls = async () => {
    try {
      const res = await fetch(`${API_BASE}/urls`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUrls(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error cargando URLs:', err);
    }
  };

  // Fetch Logs
  const loadLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error cargando logs:', err);
    }
  };

  // Initial Load and Auto-Refresh (every 5 seconds)
  useEffect(() => {
    if (currentView === 'dashboard') {
      loadConfig();
      loadUrls();
      loadLogs();

      const interval = setInterval(() => {
        loadUrls();
        loadLogs();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [user, currentView]);

  // Handle URL Form Submit
  const handleAddUrl = async (e) => {
    e.preventDefault();
    if (!user) {
      showToast('Debes iniciar sesión para añadir rastreadores', 'error');
      return;
    }
    if (!urlForm.name.trim() || !urlForm.url.trim() || !urlForm.css_selector.trim()) {
      showToast('Por favor completa todos los campos del formulario', 'error');
      return;
    }

    setIsSubmittingUrl(true);
    try {
      const res = await fetch(`${API_BASE}/urls`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(urlForm)
      });
      if (res.ok) {
        showToast('URL añadida al monitoreo');
        setUrlForm({ name: '', url: '', css_selector: '' });
        loadUrls();
      } else {
        const err = await res.json();
        showToast(err.detail || 'Error al añadir URL', 'error');
      }
    } catch (err) {
      showToast('Error de red al añadir URL', 'error');
    } finally {
      setIsSubmittingUrl(false);
    }
  };

  // Handle Delete URL
  const handleDeleteUrl = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este rastreador?')) return;
    try {
      const res = await fetch(`${API_BASE}/urls/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        showToast('Rastreador eliminado');
        loadUrls();
      } else {
        showToast('Error al eliminar rastreador', 'error');
      }
    } catch (err) {
      showToast('Error de red al eliminar', 'error');
    }
  };

  // Handle Toggle Active/Pause URL
  const handleToggleUrl = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/urls/${id}/toggle`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        loadUrls();
      } else {
        showToast('Error al cambiar estado', 'error');
      }
    } catch (err) {
      showToast('Error de red al pausar/activar', 'error');
    }
  };

  // Handle Save Config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          telegram_token: configForm.telegram_token.trim(),
          telegram_chat_id: configForm.telegram_chat_id.trim()
        })
      });
      if (res.ok) {
        showToast('Configuración guardada correctamente');
      } else {
        showToast('Error al guardar configuración', 'error');
      }
    } catch (err) {
      showToast('Error de red al guardar configuración', 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Handle Test Telegram Message
  const handleTestTelegram = async () => {
    setIsSendingTest(true);
    try {
      const res = await fetch(`${API_BASE}/test-telegram`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        showToast('Mensaje de prueba enviado a Telegram');
        loadLogs();
      } else {
        const err = await res.json();
        showToast(err.detail || 'Error al enviar mensaje', 'error');
      }
    } catch (err) {
      showToast('Error de red al enviar mensaje de prueba', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Handle Force Check Manual
  const handleForceCheck = async () => {
    setIsChecking(true);
    try {
      const res = await fetch(`${API_BASE}/force-check`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        showToast('Revisión manual completada');
        loadUrls();
        loadLogs();
      } else {
        showToast('Error en la revisión manual', 'error');
      }
    } catch (err) {
      showToast('Error de red en la revisión', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      if (res.ok) {
        const userData = await res.json();
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        showToast(`¡Bienvenido de nuevo, ${userData.name}!`);
        navigateTo('dashboard');
      } else {
        const err = await res.json();
        setLoginError(err.detail || 'Error al iniciar sesión');
      }
    } catch (err) {
      setLoginError('Error de conexión con el servidor');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Register
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterError('');
    setRegisterSuccess(false);

    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });
      if (res.ok) {
        const userData = await res.json();
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setRegisterSuccess(true);
        showToast(`¡Cuenta creada con éxito, ${userData.name}!`);
        setTimeout(() => {
          navigateTo('dashboard');
        }, 1200);
      } else {
        const err = await res.json();
        setRegisterError(err.detail || 'Error al crear la cuenta');
      }
    } catch (err) {
      setRegisterError('Error de conexión con el servidor');
    } finally {
      setRegisterLoading(false);
    }
  };

  // Auto-fill selector helper click
  const handleSelectorHelperClick = (selector) => {
    setUrlForm(prev => ({ ...prev, css_selector: selector }));
    showToast(`Selector ${selector} pegado en el formulario`);
    const input = document.getElementById('cssSelectorInput');
    if (input) input.focus();
  };

  // ----------------------------------------------------
  // RENDER: LOGIN VIEW
  // ----------------------------------------------------
  if (currentView === 'login') {
    return (
      <div className="bg-gray-950 text-gray-200 min-h-screen font-sans antialiased flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <i className="ph-fill ph-paper-plane-tilt text-telegram text-5xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Bienvenido de nuevo</h2>
          <p className="text-sm text-gray-400 text-center mb-8">Ingresa tus credenciales para acceder al panel.</p>

          {loginError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <i className="ph ph-warning-circle text-lg"></i>
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ph ph-envelope-simple text-gray-500 text-lg"></i>
                </div>
                <input
                  type="email"
                  required
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  placeholder="tu@correo.com"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ph ph-lock-key text-gray-500 text-lg"></i>
                </div>
                <input
                  type="password"
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-telegram hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-[0_0_15px_rgba(42,171,238,0.2)] mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loginLoading ? (
                <>
                  <i className="ph ph-spinner animate-spin text-lg"></i>
                  <span>Ingresando...</span>
                </>
              ) : (
                <>
                  <i className="ph ph-sign-in text-lg"></i>
                  <span>Iniciar Sesión</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            ¿No tienes cuenta?{' '}
            <button
              onClick={() => navigateTo('register')}
              className="text-telegram font-medium hover:underline focus:outline-none"
            >
              Crear una cuenta
            </button>
          </p>
        </div>

        <button
          onClick={() => navigateTo('dashboard')}
          className="mt-8 flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <i className="ph ph-arrow-left"></i> Volver al inicio
        </button>

        {/* Toast */}
        <ToastNotification toast={toast} />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: REGISTER VIEW
  // ----------------------------------------------------
  if (currentView === 'register') {
    return (
      <div className="bg-gray-950 text-gray-200 min-h-screen font-sans antialiased flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <i className="ph-fill ph-paper-plane-tilt text-telegram text-5xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Crea tu cuenta</h2>
          <p className="text-sm text-gray-400 text-center mb-8">Únete para empezar a monitorear tus páginas favoritas.</p>

          {registerError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <i className="ph ph-warning-circle text-lg"></i>
              <span>{registerError}</span>
            </div>
          )}

          {registerSuccess && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <i className="ph ph-check-circle text-lg"></i>
              <span>¡Cuenta creada con éxito! Redirigiendo...</span>
            </div>
          )}

          <form onSubmit={handleRegisterSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Completo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ph ph-user text-gray-500 text-lg"></i>
                </div>
                <input
                  type="text"
                  required
                  value={registerData.name}
                  onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  placeholder="Tu Nombre"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ph ph-envelope-simple text-gray-500 text-lg"></i>
                </div>
                <input
                  type="email"
                  required
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  placeholder="tu@correo.com"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ph ph-lock-key text-gray-500 text-lg"></i>
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={registerData.password}
                  onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={registerLoading}
              className="w-full bg-telegram hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-[0_0_15px_rgba(42,171,238,0.2)] mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {registerLoading ? (
                <>
                  <i className="ph ph-spinner animate-spin text-lg"></i>
                  <span>Creando cuenta...</span>
                </>
              ) : (
                <>
                  <i className="ph ph-user-plus text-lg"></i>
                  <span>Crear Cuenta</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <button
              onClick={() => navigateTo('login')}
              className="text-telegram font-medium hover:underline focus:outline-none"
            >
              Iniciar Sesión
            </button>
          </p>
        </div>

        <button
          onClick={() => navigateTo('dashboard')}
          className="mt-8 flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <i className="ph ph-arrow-left"></i> Volver al inicio
        </button>

        {/* Toast */}
        <ToastNotification toast={toast} />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: DASHBOARD VIEW (MAIN)
  // ----------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-10 pb-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <i className="ph-fill ph-paper-plane-tilt text-telegram text-4xl"></i>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Telegram Tracker
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-green-400 bg-green-400/10 border border-green-400/20 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              En Vivo
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Unauthenticated View */}
          {!user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateTo('login')}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => navigateTo('register')}
                className="bg-telegram hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-[0_0_15px_rgba(42,171,238,0.2)]"
              >
                Crear Cuenta
              </button>
            </div>
          ) : (
            /* Authenticated View: User Bubble */
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-telegram px-3 py-1.5 rounded-full transition-all group"
              >
                <div className="w-7 h-7 rounded-full bg-telegram flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                </div>
                <span className="text-sm font-medium text-white max-w-[120px] truncate">
                  {user.name}
                </span>
                <i className="ph ph-caret-down text-gray-400 text-xs group-hover:text-white transition-colors"></i>
              </button>

              {/* User Dropdown */}
              {userDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                  >
                    <i className="ph ph-sign-out text-base"></i>
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Force Check Button */}
          <button
            onClick={handleForceCheck}
            disabled={isChecking}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors border border-gray-700 ml-2 disabled:opacity-50"
          >
            <i className={`ph ph-arrows-clockwise text-base ${isChecking ? 'animate-spin text-telegram' : ''}`}></i>
            <span>{isChecking ? 'Revisando...' : 'Probar Actualización'}</span>
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form + Tracked Items (span 2) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Card: Add Tracker */}
          <section className="bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-lg">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <i className="ph ph-plus-circle text-telegram"></i>
              Añadir Rastreador
            </h2>
            <form onSubmit={handleAddUrl} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Nombre del Producto / Elemento</label>
                  <input
                    type="text"
                    required
                    value={urlForm.name}
                    onChange={(e) => setUrlForm({ ...urlForm, name: e.target.value })}
                    placeholder="Ej. Teclado Mecánico RGB"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">URL a Monitorear</label>
                  <input
                    type="url"
                    required
                    value={urlForm.url}
                    onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                    placeholder="https://ejemplo.com/producto"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Selector CSS del Precio / Estado (o XPath)
                </label>
                <input
                  type="text"
                  id="cssSelectorInput"
                  required
                  value={urlForm.css_selector}
                  onChange={(e) => setUrlForm({ ...urlForm, css_selector: e.target.value })}
                  placeholder="Ej. .price-tag, #final-price"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingUrl}
                className="w-full bg-telegram hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(42,171,238,0.2)] disabled:opacity-50"
              >
                {isSubmittingUrl ? (
                  <>
                    <i className="ph ph-spinner animate-spin text-lg"></i>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <i className="ph ph-paper-plane-right text-lg"></i>
                    <span>Guardar Rastreador</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Card: Tracked URLs List */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <i className="ph ph-broadcast text-telegram"></i>
              URLs Monitoreadas ({urls.length})
            </h2>

            {!user ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-xl bg-gray-900/30">
                <i className="ph ph-user-circle text-4xl text-gray-600 mb-2 block"></i>
                <p>Inicia sesión para ver y registrar tus URLs monitoreadas.</p>
                <button
                  onClick={() => navigateTo('login')}
                  className="mt-3 text-telegram hover:underline text-sm font-medium"
                >
                  Ir a Iniciar Sesión →
                </button>
              </div>
            ) : urls.length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-xl bg-gray-900/30">
                <i className="ph ph-magnifying-glass text-4xl text-gray-600 mb-2 block"></i>
                No hay URLs monitoreadas actualmente. Añade una arriba.
              </div>
            ) : (
              <div className="space-y-4">
                {urls.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <div
                          className={
                            item.error_state
                              ? 'status-error-dot'
                              : item.is_active
                              ? 'status-active-dot'
                              : 'w-2 h-2 bg-gray-600 rounded-full'
                          }
                        ></div>
                        <h3 className="font-semibold text-white truncate text-base" title={item.name}>
                          {item.name}
                        </h3>
                        {item.error_state && (
                          <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full border border-red-800 font-medium">
                            Error Scrapeo
                          </span>
                        )}
                        {!item.is_active && (
                          <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-medium">
                            Pausado
                          </span>
                        )}
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-telegram hover:underline truncate block mb-3 font-mono"
                      >
                        {item.url}
                      </a>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div className="bg-gray-950 rounded-lg p-2.5 border border-gray-800">
                          <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">
                            Último Valor:
                          </span>
                          <span className="text-sm font-mono text-gray-200 break-all">
                            {item.last_value || <em className="text-gray-500">N/A</em>}
                          </span>
                        </div>
                        <div className="bg-gray-950 rounded-lg p-2.5 border border-gray-800">
                          <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">
                            Selector CSS:
                          </span>
                          <span className="text-xs font-mono text-gray-300 break-all">
                            {item.css_selector}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-gray-500 mt-2.5 flex items-center gap-1">
                        <i className="ph ph-clock"></i>
                        Última revisión: {item.last_checked ? new Date(item.last_checked).toLocaleString() : 'Nunca'}
                      </div>
                    </div>

                    <div className="flex md:flex-col gap-2 w-full md:w-auto">
                      <button
                        onClick={() => handleToggleUrl(item.id)}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white p-2.5 rounded-lg transition-colors border border-gray-700 flex items-center justify-center"
                        title={item.is_active ? 'Pausar Monitoreo' : 'Activar Monitoreo'}
                      >
                        <i className={`${item.is_active ? 'ph ph-pause' : 'ph ph-play'} text-lg`}></i>
                      </button>
                      <button
                        onClick={() => handleDeleteUrl(item.id)}
                        className="flex-1 bg-gray-800 hover:bg-red-900/50 text-red-400 p-2.5 rounded-lg transition-colors border border-gray-700 hover:border-red-800 flex items-center justify-center"
                        title="Eliminar Rastreador"
                      >
                        <i className="ph ph-trash text-lg"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Settings + Quick Helper + Logs */}
        <div className="space-y-8">
          {/* Card: Bot Telegram Config */}
          <section className="bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-lg">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <i className="ph ph-gear text-telegram"></i>
              Configuración Bot
            </h2>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Bot Token (BotFather)
                </label>
                <input
                  type="password"
                  value={configForm.telegram_token}
                  onChange={(e) => setConfigForm({ ...configForm, telegram_token: e.target.value })}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Chat ID
                </label>
                <input
                  type="text"
                  value={configForm.telegram_chat_id}
                  onChange={(e) => setConfigForm({ ...configForm, telegram_chat_id: e.target.value })}
                  placeholder="123456789"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:border-telegram focus:ring-1 focus:ring-telegram transition-all text-sm font-mono"
                />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors border border-gray-700 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingConfig ? (
                    <>
                      <i className="ph ph-spinner animate-spin"></i> Guardando...
                    </>
                  ) : (
                    'Guardar Configuración'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={isSendingTest}
                  className="w-full bg-transparent border border-telegram text-telegram hover:bg-telegram hover:text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSendingTest ? (
                    <>
                      <i className="ph ph-spinner animate-spin"></i> Enviando...
                    </>
                  ) : (
                    'Enviar Mensaje de Prueba'
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Card: Quick CSS Selector Guide */}
          <section className="bg-gray-900 rounded-xl p-6 border border-gray-800 shadow-lg">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <i className="ph ph-code text-telegram"></i>
              Guía Rápida: Selectores CSS
            </h2>
            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex justify-between items-center bg-gray-950 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <span>Cualquier ID:</span>
                <button
                  type="button"
                  onClick={() => handleSelectorHelperClick('#id-del-elemento')}
                  className="text-telegram font-mono hover:text-white bg-gray-900 px-2 py-1 rounded transition-colors text-xs"
                >
                  #id-del-elemento
                </button>
              </li>
              <li className="flex justify-between items-center bg-gray-950 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <span>Cualquier Clase:</span>
                <button
                  type="button"
                  onClick={() => handleSelectorHelperClick('.clase-del-elemento')}
                  className="text-telegram font-mono hover:text-white bg-gray-900 px-2 py-1 rounded transition-colors text-xs"
                >
                  .clase-del-elemento
                </button>
              </li>
              <li className="flex justify-between items-center bg-gray-950 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <span>Amazon (Precio):</span>
                <button
                  type="button"
                  onClick={() => handleSelectorHelperClick('.a-price-whole')}
                  className="text-telegram font-mono hover:text-white bg-gray-900 px-2 py-1 rounded transition-colors text-xs"
                >
                  .a-price-whole
                </button>
              </li>
              <li className="flex justify-between items-center bg-gray-950 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <span>MercadoLibre (Precio):</span>
                <button
                  type="button"
                  onClick={() => handleSelectorHelperClick('.andes-money-amount__fraction')}
                  className="text-telegram font-mono hover:text-white bg-gray-900 px-2 py-1 rounded transition-colors text-xs"
                >
                  .andes-money-amount__fraction
                </button>
              </li>
              <li className="flex justify-between items-center bg-gray-950 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                <span>Steam (Precio):</span>
                <button
                  type="button"
                  onClick={() => handleSelectorHelperClick('.game_purchase_price')}
                  className="text-telegram font-mono hover:text-white bg-gray-900 px-2 py-1 rounded transition-colors text-xs"
                >
                  .game_purchase_price
                </button>
              </li>
            </ul>
            <p className="text-[10px] text-gray-500 mt-3 text-center flex items-center justify-center gap-1">
              <i className="ph ph-mouse"></i> Haz clic en el código azul para autocompletar
            </p>
          </section>

          {/* Card: Notification Logs */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 shadow-lg flex flex-col h-[400px]">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <i className="ph ph-terminal-window text-telegram"></i>
                Historial de Notificaciones
              </h2>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs font-mono custom-scrollbar">
              {!user ? (
                <div className="text-gray-500 text-center py-8">
                  Inicia sesión para ver tu historial de notificaciones.
                </div>
              ) : logs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  No hay notificaciones enviadas aún.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`border-l-2 ${
                      log.status === 'success' ? 'border-green-500' : 'border-red-500'
                    } pl-3 py-1 bg-gray-950/40 rounded-r-lg`}
                  >
                    <div className="text-[10px] text-gray-500 flex justify-between items-center">
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                      <span
                        className={`${
                          log.status === 'success' ? 'text-green-500' : 'text-red-500'
                        } uppercase font-bold text-[9px]`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <div className="text-gray-300 mt-1 whitespace-pre-wrap break-words">
                      {log.message.length > 120 ? `${log.message.substring(0, 120)}...` : log.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Floating Toast Notification */}
      <ToastNotification toast={toast} />
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: TOAST NOTIFICATION
// ----------------------------------------------------
function ToastNotification({ toast }) {
  return (
    <div
      className={`fixed bottom-5 right-5 transform transition-all duration-300 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl border ${
        toast.show ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
      } ${
        toast.type === 'success'
          ? 'bg-gray-800 border-gray-700 text-white'
          : 'bg-red-900/90 border-red-500 text-white'
      }`}
    >
      <i
        className={`${
          toast.type === 'success'
            ? 'ph-fill ph-check-circle text-green-400'
            : 'ph-fill ph-warning-circle text-red-300'
        } text-xl`}
      ></i>
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}
