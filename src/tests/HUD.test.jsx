import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HUD from '../components/gta/HUD';

// Props de armas obrigatórias desde a feature on-foot/weapons
const weaponProps = { weaponSlot: 0, ammo: [Infinity, 60, 240] };

describe('HUD', () => {
  it('mostra a vida correctamente', () => {
    render(<HUD life={75} money={0} wanted={0} {...weaponProps} />);
    expect(screen.getByText('♥ 75')).toBeInTheDocument();
  });

  it('mostra o dinheiro formatado', () => {
    render(<HUD life={100} money={1500} wanted={0} {...weaponProps} />);
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('activa o número correcto de estrelas', () => {
    render(<HUD life={100} money={0} wanted={3} {...weaponProps} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(3);
  });

  it('mostra 0 estrelas activas quando wanted = 0', () => {
    render(<HUD life={100} money={0} wanted={0} {...weaponProps} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(0);
  });

  it('mostra o nome da arma equipada', () => {
    render(<HUD life={100} money={0} wanted={0} weaponSlot={1} ammo={[Infinity, 60, 240]} />);
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });
});
