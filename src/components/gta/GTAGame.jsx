import { useState, useEffect } from 'react';
import GameCanvas from './GameCanvas';
import './GTAGame.css';

export default function GTAGame() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="gta-btn" onClick={() => setOpen(true)}>🚓 GTA City</button>
      {open && (
        <div className="gta-modal">
          <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
          <GameCanvas />
        </div>
      )}
    </>
  );
}
