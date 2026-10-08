import { useEffect, useState } from 'react';

const INSTALLED_KEY = 'gazalbide-app-installed';
function wasInstalled() {
  try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch { return false; }
}
function rememberInstallation() {
  try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* Storage is optional. */ }
}
function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
}

export default function AppInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone() || wasInstalled());
  const [instructions, setInstructions] = useState(false);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)');
    const installedNow = () => { rememberInstallation(); setInstalled(true); setPrompt(null); setInstructions(false); };
    const displayChanged = () => { if (isStandalone()) installedNow(); };
    const install = (event) => {
      event.preventDefault();
      if (isStandalone()) return;
      // A fresh browser prompt also allows reinstalling after an uninstall.
      try { localStorage.removeItem(INSTALLED_KEY); } catch { /* Storage is optional. */ }
      setInstalled(false);
      setPrompt(event);
    };
    displayChanged();
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installedNow);
    media?.addEventListener?.('change', displayChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installedNow);
      media?.removeEventListener?.('change', displayChanged);
    };
  }, []);
  const install = async () => {
    if (!prompt) { setInstructions((value) => !value); return; }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };
  if (installed || !(prompt || ios)) return null;
  return <>
    <button type="button" className="nav__link nav__link--button nav__install" onClick={install} aria-expanded={ios ? instructions : undefined}>Instalar app</button>
    {instructions && <p className="nav__install-help">En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».</p>}
  </>;
}

export function OfflineStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const status = () => setOffline(!navigator.onLine);
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    return () => { window.removeEventListener('online', status); window.removeEventListener('offline', status); };
  }, []);
  return offline ? <div className="app-install"><p role="status">Sin conexión. Algunas vistas necesitan conexión a internet.</p></div> : null;
}
