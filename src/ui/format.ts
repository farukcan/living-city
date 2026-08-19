/** Display formatting for the HUD. Numbers only — no layout decisions here. */

export function formatAmount(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (magnitude >= 100) return value.toFixed(0);
  if (magnitude >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/** Signed rate, so a HUD reader can tell surplus from drain at a glance. */
export function formatRate(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatAmount(value)}`;
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return 'stable';
  if (days >= 100) return '99+ sols';
  if (days < 1) return `${(days * 24.66).toFixed(0)} h`;
  return `${days.toFixed(1)} sols`;
}

export function formatTemperature(celsius: number): string {
  return `${celsius.toFixed(0)}°C`;
}

/** Sol fraction as a 24-hour clock, which reads faster than a decimal. */
export function formatSolClock(solTime: number): string {
  const totalMinutes = Math.floor(solTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
