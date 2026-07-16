import { Injectable } from '@nestjs/common';
import {
  getEatHour,
  getNextWhatsAppFlushTime,
  isWithinWhatsAppWindow,
} from './whatsapp-quiet-hours.util';

export interface NotificationWindow {
  channel: 'whatsapp';
  startHour: number;
  endHour: number;
  timezoneOffsetHours: number;
}

/**
 * Single source of truth for notification timing rules.
 *
 * Owns:
 * - Quiet-hour / send-window calculations (currently WhatsApp 08:00–19:00 EAT).
 * - Computing the next allowed send time for a deferred message.
 *
 * Vendure ScheduledTasks drive when jobs run; this service only answers
 * "can we send now?" and "when can we send next?". That keeps cron schedules
 * and business rules separate and testable.
 */
@Injectable()
export class NotificationCalendarService {
  private static readonly WHATSAPP_WINDOW: NotificationWindow = {
    channel: 'whatsapp',
    startHour: 8,
    endHour: 19,
    timezoneOffsetHours: 3,
  };

  /**
   * True when system-generated WhatsApp messages may be delivered immediately.
   */
  isWhatsAppWindowOpen(now: Date = new Date()): boolean {
    return isWithinWhatsAppWindow(now);
  }

  /**
   * Next allowed WhatsApp delivery time. Returns `now` when inside the window.
   */
  nextWhatsAppFlushTime(now: Date = new Date()): Date {
    return getNextWhatsAppFlushTime(now);
  }

  /**
   * Human-readable description of the current WhatsApp window for logs.
   */
  whatsAppWindowDescription(now: Date = new Date()): string {
    const w = NotificationCalendarService.WHATSAPP_WINDOW;
    const hour = getEatHour(now);
    const open = this.isWhatsAppWindowOpen(now);
    return (
      `${w.channel} window ${open ? 'open' : 'closed'} ` +
      `(EAT ${String(w.startHour).padStart(2, '0')}:00–${String(w.endHour).padStart(2, '0')}:00, ` +
      `current EAT hour ${hour})`
    );
  }
}
