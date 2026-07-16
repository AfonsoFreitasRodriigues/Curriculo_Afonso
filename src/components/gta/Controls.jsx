import './Controls.css';

const KEYS = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
};

function press(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}
function release(key) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function Btn({ label, k, style }) {
  return (
    <button
      className="ctrl-btn"
      style={style}
      onPointerDown={() => press(k)}
      onPointerUp={() => release(k)}
      onPointerLeave={() => release(k)}
      onPointerCancel={() => release(k)}
    >
      {label}
    </button>
  );
}

export default function Controls() {
  return (
    <>
      <div className="ctrl-pad">
        <Btn label="▲" k={KEYS.up}    style={{ gridRow: 1, gridColumn: 2 }} />
        <Btn label="◀" k={KEYS.left}  style={{ gridRow: 2, gridColumn: 1 }} />
        <Btn label="▼" k={KEYS.down}  style={{ gridRow: 2, gridColumn: 2 }} />
        <Btn label="▶" k={KEYS.right} style={{ gridRow: 2, gridColumn: 3 }} />
      </div>
      <div className="ctrl-pad ctrl-pad-right">
        <Btn label="F"    k="f" style={{ gridRow: 1, gridColumn: 1 }} />
        <Btn label="FIRE" k=" " style={{ gridRow: 2, gridColumn: 1 }} />
      </div>
    </>
  );
}
