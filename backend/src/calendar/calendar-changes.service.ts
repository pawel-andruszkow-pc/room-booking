import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * In-process bus announcing "this calendar changed, re-read it".
 *
 * Producers: Google push notifications (GoogleWatchService) and our own
 * writes (BookingsService after book / end / release). The consumer is
 * RoomStreamService, which refreshes the affected rooms and pushes to tablets.
 * Living in CalendarModule keeps BookingsModule free of Google specifics.
 */
@Injectable()
export class CalendarChangesService {
  private readonly subject = new Subject<string>();
  private readonly pushed = new Set<string>();

  /** Emits the id of every calendar that (may) have changed. */
  get changes$(): Observable<string> {
    return this.subject.asObservable();
  }

  notify(calendarId: string): void {
    this.subject.next(calendarId);
  }

  /** Records whether Google is currently pushing notifications for a calendar. */
  setPushActive(calendarId: string, active: boolean): void {
    if (active) this.pushed.add(calendarId);
    else this.pushed.delete(calendarId);
  }

  /** True when changes to this calendar arrive by push, so polling can slow down. */
  hasPush(calendarId: string): boolean {
    return this.pushed.has(calendarId);
  }
}
