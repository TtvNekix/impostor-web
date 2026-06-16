import { useT } from '../i18n/I18nContext';

/**
 * Global "powered by coffeeprojects" footer.
 *
 * Rendered once at the app root so every screen (lobby, discussion,
 * voting, evaluation, game-over, entry) shows the same attribution
 * without each screen having to remember to add it.
 *
 * Positioned fixed at the bottom of the viewport so it never pushes
 * the actual page content. Content screens add `padding-bottom` to
 * leave room for it.
 */
export function PoweredByFooter() {
  const t = useT();
  return (
    <footer className="powered-by-footer">
      <span className="powered-by-footer__text">{t.common.poweredBy}</span>
      {' '}
      <a
        href="https://coffeeprojects.es"
        target="_blank"
        rel="noopener noreferrer"
        className="powered-by-footer__link"
      >
        coffeeprojects
      </a>
    </footer>
  );
}
