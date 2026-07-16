import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HUD from '../components/gta/HUD';

describe('HUD', () => {
  it('mostra a vida correctamente', () => {
    render(<HUD life={75} money={0} wanted={0} />);
    expect(screen.getByText('♥ 75')).toBeInTheDocument();
  });

  it('mostra o dinheiro formatado', () => {
    render(<HUD life={100} money={1500} wanted={0} />);
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('activa o número correcto de estrelas', () => {
    render(<HUD life={100} money={0} wanted={3} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(3);
  });

  it('mostra 0 estrelas activas quando wanted = 0', () => {
    render(<HUD life={100} money={0} wanted={0} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(0);
  });
});
