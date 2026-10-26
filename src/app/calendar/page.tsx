import { listEventsByMonth } from '@/server/actions/event';
import { dateKey } from '@/lib/utils';
import { CalendarClient } from './calendar-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: '日历' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '')
    ? sp.month!
    : dateKey().slice(0, 7);

  const list = await listEventsByMonth(month);

  return (
    <CalendarClient
      initialMonth={month}
      initialEvents={list.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        allDay: e.allDay,
        location: e.location,
      }))}
    />
  );
}
