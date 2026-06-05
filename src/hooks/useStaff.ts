import { useCallback, useEffect, useState } from "react";
import type { PartyMember } from "../data/quests";
import { rowToStaffMember, type StaffRow } from "../lib/staffMapper";
import { fetchStaff } from "../lib/staffApi";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

export function useStaff() {
  const [staff, setStaff] = useState<PartyMember[]>([]);
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
      const data = await fetchStaff();
      setStaff(data);
    } catch (e) {
      setError("プレイヤー情報の読み込みに失敗しました。");
      setStaff([]);
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
      .channel("staff-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id != null) {
              setStaff((prev) => prev.filter((member) => member.id !== String(old.id)));
            }
            return;
          }

          const member = rowToStaffMember(payload.new as StaffRow);
          setStaff((prev) => {
            const index = prev.findIndex((item) => item.id === member.id);
            if (index === -1) return [...prev, member];
            const next = [...prev];
            next[index] = member;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  return { staff, loading, error, reload };
}
