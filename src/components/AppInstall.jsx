import { useEffect, useState } from 'react';

export default function AppInstall() {
  const [prompt, setPrompt] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [instructions, setInstructions] = useState(false);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  useEffect(() => {
    const install = (event) => { event.preventDefault(); setPrompt(event); };
    const installed = () => { setPrompt(null); setInstructions(false); };
    const status = () => setOffline(!navigator.onLine);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
    };
  }, []);
  const install = async () => {
    if (!prompt) { setInstructions((value) => !value); return; }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };
  return <div className="app-install">
    {offline && <p role="status">Sin conexión. Algunas vistas necesitan conexión a internet.</p>}
    {!standalone && (prompt || ios) && <button type="button" className="btn" onClick={install} aria-expanded={ios ? instructions : undefined}>Instalar app</button>}
    {instructions && <p>En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».</p>}
  </div>;
}
