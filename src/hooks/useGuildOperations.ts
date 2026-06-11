import { useCallback, useEffect, useState } from "react";
import type { GuildNotice, GuildRequest } from "../data/guildOperations";
import {
  fetchGuildNotices,
  fetchGuildRequests,
  rowToGuildNotice,
  rowToGuildRequest,
  type GuildNoticeRow,
  type GuildRequestRow,
} from "../lib/guildOperationsApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useGuildOperations() {
  const [notices, setNotices] = useState<GuildNotice[]>([]);
  const [requests, setRequests] = useState<GuildRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mergeNotice = useCallback((notice: GuildNotice) => {
    setNotices((prev) => {
      const index = prev.findIndex((item) => item.id === notice.id);
      if (index === -1) return [notice, ...prev];
      const next = [...prev];
      next[index] = notice;
      return next;
    });
  }, []);

  const mergeRequest = useCallback((request: GuildRequest) => {
    setRequests((prev) => {
      const index = prev.findIndex((item) => item.id === request.id);
      if (index === -1) return [request, ...prev];
      const next = [...prev];
      next[index] = request;
      return next;
    });
  }, []);

  const removeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  const removeRequest = useCallback((id: number) => {
    setRequests((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are not set.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextNotices, nextRequests] = await Promise.all([
        fetchGuildNotices(),
        fetchGuildRequests(),
      ]);
      setNotices(nextNotices);
      setRequests(nextRequests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load guild operations");
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
      .channel("guild-operations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guild_notices" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) removeNotice(old.id);
            return;
          }
          const row = payload.new as GuildNoticeRow;
          if (row?.id != null) mergeNotice(rowToGuildNotice(row));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guild_requests" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) removeRequest(old.id);
            return;
          }
          const row = payload.new as GuildRequestRow;
          if (row?.id != null) mergeRequest(rowToGuildRequest(row));
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mergeNotice, mergeRequest, removeNotice, removeRequest]);

  return {
    notices,
    requests,
    loading,
    error,
    reload,
  };
}
