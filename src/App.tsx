import { lazy, Suspense, type ReactNode } from 'react';
import { LiveCatalog } from './LiveCatalog';
import { ChunkBoundary } from './components/ChunkBoundary';
import { SiteFooter, SiteHeader } from './components/SiteHeader';
import { HOSTED } from './domain/hosted';

const MapPage = lazy(() => import('./MapPage').then((module) => ({ default: module.MapPage })));
const PassportPage = lazy(() => import('./PassportPage').then((module) => ({ default: module.PassportPage })));

export function App() {
  const path = window.location.pathname;
  if (path === '/map') return <ChunkBoundary label="The map"><Suspense fallback={<p className="sr-only" role="status">Loading the map…</p>}><MapPage /></Suspense></ChunkBoundary>;
  if (path === '/passport') return <Shell current="/passport"><ChunkBoundary label="The passport"><Suspense fallback={<p role="status">Opening your passport…</p>}><PassportPage /></Suspense></ChunkBoundary></Shell>;
  return <Shell current="/"><LiveCatalog /></Shell>;
}

/** The planning desk and passport share a header, data notice and footer. Every session shown is real AWS Events API data. */
function Shell({ current, children }: { current: '/' | '/passport'; children: ReactNode }) {
  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <SiteHeader current={current} />
    <aside className="sample-banner" aria-label="Data notice"><strong>Real event data only</strong><span>{HOSTED ? 'Hosted preview: no sign-in and no sessions here. Real AWS Events API data appears only in the local app.' : 'Sessions come from the AWS Events API after you sign in with your registered Builder ID. Nothing here is invented.'}</span></aside>
    <main id="content" tabIndex={-1}>{children}</main>
    <SiteFooter />
  </>;
}
