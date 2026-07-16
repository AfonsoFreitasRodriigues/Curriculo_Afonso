import foto from '../assets/afonso.jpg';
import './Header.css';
import PacmanGame from './PacmanGame';
import GTAGame from './gta/GTAGame';

function calcularIdade() {
  const nascimento = new Date(2010, 8, 20); // 20 de setembro de 2010
  const hoje = new Date();

  let idade = hoje.getFullYear() - nascimento.getFullYear();

  const fezAnos =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() &&
      hoje.getDate() >= nascimento.getDate());

  if (!fezAnos) {
    idade--;
  }

  return idade;
}

const SKILLS = ['React', 'JavaScript', 'HTML', 'C', 'C++', 'Git'];

function Header() {
  const idade = calcularIdade();
  const ano = new Date().getFullYear();

  return (
    <header className="header">
      <div className="header-top">
        <span className="header-label">Currículo — {ano}</span>
        <span className="header-label header-label-right">01 / EPATV</span>
      </div>

      <div className="header-grid">
        <div className="header-photo">
          <img src={foto} alt="Afonso Freitas Rodrigues" />
        </div>

        <div className="header-info">
          <h1 className="header-name">Afonso Freitas Rodrigues</h1>
          <p className="header-role">
            Estudante de Técnico de Informática de Gestão, EPATV
          </p>

          <p className="header-meta">
            {idade} anos <span className="dot">·</span> Vila Verde, Braga,
            Portugal
          </p>

          <hr className="rule" />

          <p className="header-bio">
            Apaixonado por tecnologia e programação desde muito cedo.
            Atualmente a estagiar na Santa Casa da Misericórdia de Vila
            Verde, onde continuo a desenvolver as minhas competências na
            área da informática.
          </p>

          <div className="header-row">
            <span className="row-label">Tecnologias</span>
            <p className="row-content">{SKILLS.join('  ·  ')}</p>
          </div>

          <div className="header-row">
            <span className="row-label">Contacto</span>
            <div className="row-content contact-links">
              <a
                href="https://github.com/afonso012210-design/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="15" height="15" viewBox="0 0 19 19" aria-hidden="true">
                  <use href="/icons.svg#github-icon" fill="currentColor" />
                </svg>
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/afonso-freitas-53772a41b/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13M7.11 20.45H3.56V9h3.55z" />
                </svg>
                LinkedIn
              </a>
              <a href="mailto:afonso012210@gmail.com">
                afonso012210@gmail.com
              </a>
              <a href="tel:+351928127370">928 127 370</a>
            </div>
          </div>
          <PacmanGame />
          <GTAGame />
        </div>
      </div>
    </header>
  );
}

export default Header;
