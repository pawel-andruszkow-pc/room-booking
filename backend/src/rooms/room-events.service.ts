import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * Fires after any room is created, updated or deleted so other modules can
 * react (GoogleWatchService re-syncs push channels) without RoomsModule
 * depending on them. Deliberately payload-free: consumers re-read the table.
 */
@Injectable()
export class RoomEventsService {
  private readonly subject = new Subject<void>();

  get changed$(): Observable<void> {
    return this.subject.asObservable();
  }

  emit(): void {
    this.subject.next();
  }
}
