
import { useEffect, useRef, useState } from 'react';
import './PacmanGame.css';

export default function TetrisGame() {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = 30;
    const cols = 10;
    const rows = 16;
    canvas.width = cols * size;
    canvas.height = rows * size;

    let piece = { x: 4, y: 0 };
    const keys = {};
    const kd = (e) => (keys[e.key] = true);
    const ku = (e) => (keys[e.key] = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    let anim;
    function loop() {
      if (keys['ArrowLeft']) piece.x = Math.max(0, piece.x - 1);
      if (keys['ArrowRight']) piece.x = Math.min(cols - 1, piece.x + 1);
      if (keys['ArrowDown']) piece.y = Math.min(rows - 1, piece.y + 1);

      ctx.fillStyle = '#111';
      ctx.fillRect(0,0,canvas.width,canvas.height);

      ctx.strokeStyle = '#333';
      for(let x=0;x<=cols;x++){
        ctx.beginPath(); ctx.moveTo(x*size,0); ctx.lineTo(x*size,canvas.height); ctx.stroke();
      }
      for(let y=0;y<=rows;y++){
        ctx.beginPath(); ctx.moveTo(0,y*size); ctx.lineTo(canvas.width,y*size); ctx.stroke();
      }

      ctx.fillStyle = '#00d4ff';
      ctx.fillRect(piece.x*size+2,piece.y*size+2,size-4,size-4);

      anim = requestAnimationFrame(loop);
    }
    loop();

    const gravity = setInterval(() => {
      piece.y = piece.y >= rows - 1 ? 0 : piece.y + 1;
    }, 500);

    return () => {
      cancelAnimationFrame(anim);
      clearInterval(gravity);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [open]);

  return (
    <>
      <button className="pacman-btn" onClick={() => setOpen(true)}>🧩 Jogar Tetris</button>
      {open && (
        <div className="pacman-modal">
          <div className="pacman-box">
            <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
            <canvas ref={canvasRef}></canvas>
            <p style={{color:'white'}}>Usa as setas para mover a peça.</p>
          </div>
        </div>
      )}
    </>
  );
}
