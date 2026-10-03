import { buildDeadlineIcs, daysUntilMarch31 } from './deadline-reminder.service';

describe('deadline helpers', () => {
  it('counts whole days to 31 March regardless of time of day', () => {
    expect(daysUntilMarch31(2026, new Date(2026, 2, 1, 23, 59))).toBe(30);
    expect(daysUntilMarch31(2026, new Date(2026, 2, 31, 8, 0))).toBe(0);
    expect(daysUntilMarch31(2026, new Date(2026, 3, 1))).toBe(-1);
  });

  it('builds a calendar event due 31 March of the year after the YOA', () => {
    const ics = buildDeadlineIcs(2025, new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
    expect(ics).toContain('DTSTART;VALUE=DATE:20260331');
    expect(ics).toContain('DTSTAMP:20260102T030405Z');
    expect(ics).toContain('UID:lagosfile-deadline-2025@lagosfile');
    expect(ics.match(/BEGIN:VALARM/g)?.length).toBe(3);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
