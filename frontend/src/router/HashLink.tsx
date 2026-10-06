import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { useRouter } from './RouterProvider';
import { toHash, type Screen } from './routes';

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Screen;
  children: ReactNode;
}

/**
 * A navigation link.
 *
 * A real `<a href="#/...">` rather than a button with a click handler, so the
 * browser's own affordances apply: middle-click and "open in new tab" work, and
 * the status bar shows where the link goes. Clicks are intercepted only to run
 * the same state update a hashchange would, and never for a modified click.
 */
export function HashLink({ to, children, onClick, ...rest }: Props) {
  const { navigate } = useRouter();
  return (
    <a
      href={toHash(to)}
      onClick={(e) => {
        onClick?.(e);
        // Let the browser handle new-tab/new-window and non-primary clicks.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}