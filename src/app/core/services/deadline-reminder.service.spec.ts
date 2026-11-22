import { TestBed } from '@angular/core/testing';
import { DeadlineReminderService, buildDeadlineIcs, daysUntilMarch31 } from './deadline-reminder.service';
import { FilingService } from './filing.service';
import { Filing } from '../models';

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

describe('DeadlineReminderService', () => {
  const KEY = 'lagosfile-deadline-notified';
  const win = window as unknown as { Notification: unknown };
  let savedNotification: unknown;
  let filingSpy: jasmine.SpyObj<FilingService>;
  let service: DeadlineReminderService;
  let sent: { title: string; options: { body: string } }[];
  let requestPermission: jasmine.Spy;

  function installNotification(permission: string): void {
    sent = [];
    requestPermission = jasmine.createSpy('requestPermission').and.resolveTo('denied');
    win.Notification = class {
      static permission = permission;
      static requestPermission = requestPermission;
      constructor(title: string, options: { body: string }) {
        sent.push({ title, options });
      }
    };
  }

  function filing(yearOfAssessment: number, status: Filing['status']): Filing {
    return { id: `f-${yearOfAssessment}`, taxpayerId: 'tp-1', yearOfAssessment, status, createdAt: '', taxConfigVersion: 'NTA 2025' };
  }

  beforeEach(() => {
    savedNotification = win.Notification;
    installNotification('granted');
    localStorage.removeItem(KEY);
    filingSpy = jasmine.createSpyObj('FilingService', ['listFilings']);
    filingSpy.listFilings.and.resolveTo([]);
    TestBed.configureTestingModule({ providers: [{ provide: FilingService, useValue: filingSpy }] });
    service = TestBed.inject(DeadlineReminderService);
  });

  afterEach(() => {
    win.Notification = savedNotification;
    localStorage.removeItem(KEY);
  });

  it('does nothing outside the 45-day window before 31 March', async () => {
    await service.check(new Date(2026, 0, 15, 12));
    await service.check(new Date(2026, 3, 1, 12));
    expect(filingSpy.listFilings).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('notifies about the previous income year and remembers the day', async () => {
    const today = new Date(2026, 2, 1, 12);
    filingSpy.listFilings.and.resolveTo([filing(2025, 'Draft'), filing(2024, 'Submitted')]);
    await service.check(today);
    expect(sent.length).toBe(1);
    expect(sent[0].title).toBe('30 days to the filing deadline');
    expect(sent[0].options.body).toBe('Your YOA 2025 Direct Assessment return is due by 31 March.');
    expect(localStorage.getItem(KEY)).toBe(today.toISOString().slice(0, 10));

    await service.check(today);
    expect(sent.length).toBe(1);
    expect(filingSpy.listFilings).toHaveBeenCalledTimes(1);
  });

  it('uses singular and same-day wording', async () => {
    await service.check(new Date(2026, 2, 30, 12));
    expect(sent[0].title).toBe('1 day to the filing deadline');
    localStorage.removeItem(KEY);
    await service.check(new Date(2026, 2, 31, 12));
    expect(sent[1].title).toBe('Filing deadline is today');
  });

  it('stays quiet once the year has been filed', async () => {
    filingSpy.listFilings.and.resolveTo([filing(2025, 'Confirmed')]);
    await service.check(new Date(2026, 2, 10, 12));
    expect(sent).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('asks for permission and only notifies when it is granted', async () => {
    installNotification('denied');
    await service.check(new Date(2026, 2, 10, 12));
    expect(sent).toEqual([]);
    expect(requestPermission).toHaveBeenCalled();

    requestPermission.and.resolveTo('granted');
    await service.check(new Date(2026, 2, 10, 12));
    expect(sent.length).toBe(1);
  });

  it('swallows errors while loading filings', async () => {
    filingSpy.listFilings.and.rejectWith(new Error('locked'));
    await expectAsync(service.check(new Date(2026, 2, 10, 12))).toBeResolved();
    expect(sent).toEqual([]);
  });

  it('still notifies when local storage is unavailable', async () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    await service.check(new Date(2026, 2, 10, 12));
    expect(sent.length).toBe(1);
  });
});
