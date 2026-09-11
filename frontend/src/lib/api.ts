import { request, streamEvents } from './http';
import type {
  CalendarEvent,
  CalendarProviderInfo,
  CalendarSummary,
  ConnectionTestResult,
  Device,
  PinScope,
  PublicSettings,
  Room,
  RoomDay,
  RoomStatus,
} from '@/types';

/** Typed endpoints. One function per backend route. */
export const api = {
  auth: {
    me: (authorization?: string) =>
      request<{ user: string; calendarProvider: string }>('/auth/me', { authorization }),
    verifyPin: (scope: PinScope, pin: string) =>
      request<{ ok: true; scope: PinScope }>('/auth/pin', {
        method: 'POST',
        body: { scope, pin },
      }),
  },

  settings: {
    get: () => request<PublicSettings>('/settings'),
    update: (patch: Partial<PublicSettings> & { settingsPin?: string; adminPin?: string }) =>
      request<PublicSettings>('/settings', { method: 'PATCH', body: patch }),
  },

  rooms: {
    list: (all = false) => request<Room[]>(`/rooms${all ? '?all=true' : ''}`),
    get: (id: string) => request<Room>(`/rooms/${id}`),
    create: (body: Partial<Room>) => request<Room>('/rooms', { method: 'POST', body }),
    update: (id: string, body: Partial<Room>) =>
      request<Room>(`/rooms/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => request<void>(`/rooms/${id}`, { method: 'DELETE' }),

    status: (id: string, signal?: AbortSignal) =>
      request<RoomStatus>(`/rooms/${id}/status`, { signal }),
    /** Live status pushed by the backend whenever the room changes. */
    streamStatus: (
      id: string,
      opts: { signal: AbortSignal; onMessage: (s: RoomStatus) => void; onError?: () => void },
    ) => streamEvents<RoomStatus>(`/rooms/${id}/stream`, opts),
    today: (id: string, signal?: AbortSignal) =>
      request<RoomDay>(`/rooms/${id}/today`, { signal }),
    book: (id: string, durationMinutes: number, title?: string) =>
      request<RoomStatus>(`/rooms/${id}/book`, {
        method: 'POST',
        body: { durationMinutes, title: title || undefined },
      }),
    /** Same endpoint, for a slot later today rather than from now. */
    reserve: (id: string, startsAt: string, durationMinutes: number, title?: string) =>
      request<RoomStatus>(`/rooms/${id}/book`, {
        method: 'POST',
        body: { startsAt, durationMinutes, title: title || undefined },
      }),
    end: (id: string, eventId: string) =>
      request<RoomStatus>(`/rooms/${id}/end`, { method: 'POST', body: { eventId } }),
    checkIn: (id: string, eventId: string) =>
      request<RoomStatus>(`/rooms/${id}/check-in`, { method: 'POST', body: { eventId } }),
    release: (id: string, eventId: string) =>
      request<RoomStatus>(`/rooms/${id}/release`, { method: 'POST', body: { eventId } }),
  },

  devices: {
    list: () => request<Device[]>('/devices'),
    register: (id: string, userAgent: string) =>
      request<Device>('/devices/register', { method: 'POST', body: { id, userAgent } }),
    get: (id: string) => request<Device>(`/devices/${id}`),
    update: (id: string, body: { name?: string; roomId?: string | null; isKiosk?: boolean }) =>
      request<Device>(`/devices/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => request<void>(`/devices/${id}`, { method: 'DELETE' }),
  },

  calendar: {
    provider: () => request<CalendarProviderInfo>('/calendar/provider'),
    calendars: () => request<CalendarSummary[]>('/calendar/calendars'),
    addCalendar: (calendarId: string) =>
      request<CalendarSummary>('/calendar/calendars', { method: 'POST', body: { calendarId } }),
    test: (calendarId: string) =>
      request<ConnectionTestResult>('/calendar/test', { method: 'POST', body: { calendarId } }),
    createLocalEvent: (body: { calendarId: string; title: string; start: string; end: string }) =>
      request<CalendarEvent>('/calendar/local/events', { method: 'POST', body }),
  },
};
