import { getRandomBytes } from 'expo-crypto';

/** RFC 9562 UUIDv7: time-ordered, device-generated. */
export function uuidv7(): string {
  const ts = Date.now();
  const rand = getRandomBytes(10);

  const hex: string[] = [];
  // 48-bit timestamp
  let t = ts;
  for (let i = 5; i >= 0; i--) {
    hex.push(((t >> (i * 8)) & 0xff).toString(16).padStart(2, '0'));
  }
  const b = Array.from(rand);
  // version 7
  b[0] = (b[0] & 0x0f) | 0x70;
  // variant 10xx
  b[2] = (b[2] & 0x3f) | 0x80;

  const s = hex.join('') + b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  return toDateIso(new Date());
}

export function toDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = iso.length > 10 ? new Date(iso) : new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
