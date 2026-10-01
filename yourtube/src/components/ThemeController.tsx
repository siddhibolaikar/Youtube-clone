import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useUser } from "@/lib/AuthContext";
import { fetchGeo, type ClientGeo } from "@/lib/geoClient";
import { getClientOverrides } from "@/lib/testOverrides";
import { istHourNow, msToNextMinute, themeFor } from "@/lib/theme";

/**
 * Applies the IST time + region theme rule. Location is looked up on load and
 * again whenever someone signs in; the time is re-checked every minute so the
 * theme flips exactly at 10:00 and 12:00 IST.
 */
export default function ThemeController() {
  const { setTheme } = useTheme();
  const { user } = useUser();
  const [geo, setGeo] = useState<ClientGeo | null>(null);
  const signedInUid = user?.uid ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchGeo({ refresh: signedInUid !== null }).then((g) => !cancelled && setGeo(g));
    return () => {
      cancelled = true;
    };
  }, [signedInUid]);

  useEffect(() => {
    const apply = () => {
      const hour = istHourNow(getClientOverrides().hour);
      setTheme(themeFor({ hour, regionCode: geo?.regionCode, country: geo?.country }));
    };
    apply();
    let interval: ReturnType<typeof setInterval> | undefined;
    // Align to the minute boundary, then tick every minute.
    const timeout = setTimeout(() => {
      apply();
      interval = setInterval(apply, 60_000);
    }, msToNextMinute());
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [geo, setTheme]);

  return null;
}
