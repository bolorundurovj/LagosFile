import { Injectable, inject } from '@angular/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { FilingService } from './filing.service';

const LAST_NOTIFIED_KEY = 'lagosfile-deadline-notified';
const REMINDER_WINDOW_DAYS = 45;

/** Days from `today` to 31 March of `year`, rounded up. */
export function daysUntilMarch31(year: number, today = new Date()): number {
  const deadline = new Date(year, 2, 31);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((deadline.getTime() - start.getTime()) / 86_400_000);
}

/** iCalendar event for the filing deadline with alarms 30, 7 and 1 day before. */
export function buildDeadlineIcs(yearOfAssessment: number, now = new Date()): string {
  const due = yearOfAssessment + 1;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const alarm = (days: number) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:LIRS Direct Assessment due in ${days} day${days === 1 ? '' : 's'}`,
    `TRIGGER:-P${days}D`,
    'END:VALARM',
  ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LagosFile//Deadline//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:lagosfile-deadline-${yearOfAssessment}@lagosfile`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${due}0331`,
    `DTEND;VALUE=DATE:${due}0401`,
    `SUMMARY:LIRS Direct Assessment deadline (YOA ${yearOfAssessment})`,
    `DESCRIPTION:File and pay your YOA ${yearOfAssessment} Direct Assessment return on etax.lirs.gov.ng.`,
    ...alarm(30),
    ...alarm(7),
    ...alarm(1),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Raises a desktop notification, at most once a day, while the deadline is near and unfiled. */
@Injectable({ providedIn: 'root' })
export class DeadlineReminderService {
  private filingService = inject(FilingService);

  async check(today = new Date()): Promise<void> {
    const days = daysUntilMarch31(today.getFullYear(), today);
    if (days < 0 || days > REMINDER_WINDOW_DAYS) return;

    const todayKey = today.toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(LAST_NOTIFIED_KEY) === todayKey) return;
    } catch { /* storage unavailable */ }

    const yoa = today.getFullYear() - 1;
    try {
      const filings = await this.filingService.listFilings();
      const filed = filings.some(f => f.yearOfAssessment === yoa && f.status !== 'Draft');
      if (filed) return;

      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === 'granted';
      if (!granted) return;

      sendNotification({
        title: days === 0 ? 'Filing deadline is today' : `${days} day${days === 1 ? '' : 's'} to the filing deadline`,
        body: `Your YOA ${yoa} Direct Assessment return is due by 31 March.`,
      });
      try { localStorage.setItem(LAST_NOTIFIED_KEY, todayKey); } catch { /* storage unavailable */ }
    } catch {
      // reminders are best-effort; the dashboard banner still shows
    }
  }
}
