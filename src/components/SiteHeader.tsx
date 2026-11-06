import { HOSTED } from '../domain/hosted';

/** Shared header for the planning desk and the passport. Original mark; not an AWS logo. */
export function SiteHeader({ current }: { current: '/' | '/passport' }) {
  const links = [['/', 'Planner'], ['/map', 'Strip globe'], ['/passport', 'Passport']] as const;
  return <header className="topbar">
    <a className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">c</span><span>campus <span className="wordmark-light">companion</span><small>for re:Invent 2026 · independent</small></span></a>
    <nav aria-label="Main navigation">{links.map(([href, label]) => <a key={href} className="nav-button" href={href} aria-current={href === current ? 'page' : undefined}>{label}</a>)}</nav>
    <span className="local-badge"><span aria-hidden="true" /> {HOSTED ? 'Hosted preview' : 'Running on this computer'}</span>
  </header>;
}

export function SiteFooter() {
  return <footer><span>Made for curious builders.</span><span>Independent project · Original artwork · Not an official AWS app · <a href="https://aws.amazon.com/events/reinvent/" target="_blank" rel="noreferrer">Official re:Invent site ↗</a> · <a href="https://docs.aws.amazon.com/events/latest/devguide/what-is-events-api.html" target="_blank" rel="noreferrer">AWS Events API ↗</a></span></footer>;
}
