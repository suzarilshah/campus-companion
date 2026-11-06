import type { LiveSession } from './live';

/** Plain-language text for documented BulkFailureCode values. Unknown codes stay generic refusals, as documented. */
const failureText: Record<string, string> = {
  sessionNotReservable: 'This session does not take reservations.',
  scheduleConflict: 'It clashes with something already on your schedule.',
  alreadyScheduled: 'It is already on your schedule.',
  sessionFull: 'The session is full.',
  insufficientAccess: 'Your registration does not include access to this session.',
  timePassed: 'This session has already started or ended.',
  unconfirmed: 'The response was lost and GetSchedule does not show it. Nothing was re-sent; review and try again if you still want it.',
  stillReserved: 'GetSchedule still shows this reservation.',
};
export function describeFailure(code: string | undefined) {
  return code ? failureText[code] ?? `AWS refused this request (${code}).` : 'AWS did not confirm this change.';
}

/** Start/end in minutes since the local calendar day starts, only when date, time and length are all present. */
function span(session: LiveSession) {
  const time = /^(\d{1,2}):(\d{2})$/.exec(session.time ?? '');
  const minutes = Number(session.minutes);
  if (!session.date || !time || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const start = Number(time[1]) * 60 + Number(time[2]);
  return { date: session.date, zone: session.timezone ?? '', start, end: start + minutes };
}

/**
 * Local, pre-submission clash hints between listed local times. They are hints only: sessions are compared only when
 * they list the same timezone label (or both omit it), and AWS's `scheduleConflict` result remains authoritative.
 */
export function clashes(candidate: LiveSession, others: LiveSession[]) {
  const a = span(candidate);
  if (!a) return [];
  return others.filter((other) => {
    if (other.id === candidate.id) return false;
    const b = span(other);
    return Boolean(b && b.date === a.date && b.zone === a.zone && a.start < b.end && b.start < a.end);
  });
}
