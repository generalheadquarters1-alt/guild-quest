import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent } from "../data/calendar";
import {
  fetchCalendarEvents,
  rowToCalendarEvent,
  type CalendarEventRow,
} from "../lib/calendarApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase設定が未完了です。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setEvents(await fetchCalendarEvents());
    } catch {
      setError("ギルド暦の読み込みに失敗しました。");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const client = requireSupabase();
    const channel = client
      .channel("calendar-events-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) {
              setEvents((prev) => prev.filter((event) => event.id !== old.id));
            }
            return;
          }

          const row = payload.new as CalendarEventRow;
          if (row?.id == null) return;
          const event = rowToCalendarEvent(row);
          setEvents((prev) => {
            const index = prev.findIndex((item) => item.id === event.id);
            if (index === -1) return [...prev, event].sort(sortEvents);
            const next = [...prev];
            next[index] = event;
            return next.sort(sortEvents);
          });
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  return { events, loading, error, reload };
}

function sortEvents(a: CalendarEvent, b: CalendarEvent) {
  const byDate = a.eventDate.localeCompare(b.eventDate);
  if (byDate !== 0) return byDate;
  return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
}
