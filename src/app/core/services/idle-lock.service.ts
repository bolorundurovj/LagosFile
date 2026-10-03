import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

const STORAGE_KEY = 'lagosfile-idle-lock-minutes';
const DEFAULT_MINUTES = 10;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;

/** Locks the encrypted database after a period with no user activity. */
@Injectable({ providedIn: 'root' })
export class IdleLockService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);

  /** Minutes of inactivity before locking; 0 disables the auto-lock. */
  readonly minutes = signal(this.readMinutes());

  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private readonly onActivity = () => this.reset();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.zone.runOutsideAngular(() => {
      for (const e of ACTIVITY_EVENTS) window.addEventListener(e, this.onActivity, { passive: true });
    });
    this.reset();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, this.onActivity);
  }

  setMinutes(minutes: number): void {
    this.minutes.set(minutes);
    try { localStorage.setItem(STORAGE_KEY, String(minutes)); } catch { /* storage unavailable */ }
    if (this.running) this.reset();
  }

  private reset(): void {
    clearTimeout(this.timer);
    const minutes = this.minutes();
    if (!this.running || minutes <= 0) return;
    this.timer = setTimeout(() => this.zone.run(() => this.lock()), minutes * 60_000);
  }

  private async lock(): Promise<void> {
    if (!this.auth.isUnlocked()) return;
    this.stop();
    try {
      await this.auth.lock();
    } finally {
      await this.router.navigate(['/unlock'], { queryParams: { reason: 'idle' } });
    }
  }

  private readMinutes(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw === null ? DEFAULT_MINUTES : Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MINUTES;
    } catch {
      return DEFAULT_MINUTES;
    }
  }
}
