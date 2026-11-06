import { HOSTED, REPO_URL } from '../domain/hosted';

/** Shown in place of the sign-in button on the hosted preview, where AWS attendee sign-in cannot work. */
export function HostedNotice({ compact = false }: { compact?: boolean }) {
  if (!HOSTED) return null;
  return <div className={`hosted-notice${compact ? ' compact' : ''}`} role="note">
    <strong>You’re viewing the hosted preview.</strong>
    <span>AWS only allows attendee sign-in back to an app on your own computer, so real sessions, favorites and reservations work in the local app. Explore the globe and collect passport stamps here; they’re saved in this browser.</span>
    <a href={REPO_URL} target="_blank" rel="noreferrer">Run it locally — GitHub ↗</a>
  </div>;
}
