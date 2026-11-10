import { useEffect, useState } from "react";
import { dateInTz } from "@/lib/domain/time";

/** Today in São Paulo, refreshed every minute (client only). */
export function useToday() {
  const [today, setToday] = useState(() => dateInTz());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setToday(dateInTz());
      setNow(Date.now());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return { today, now };
}
