import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { INDIAN_REGIONS } from "@/lib/regions";
import { getClientOverrides, TEST_OVERRIDES_ENABLED, type TestOverrides } from "@/lib/testOverrides";

/** Always-visible label while a geo/time override is active, so demos can't be mistaken for real data. */
export default function TestOverrideBadge() {
  const [o, setO] = useState<TestOverrides>({});
  useEffect(() => setO(getClientOverrides()), []);
  if (!TEST_OVERRIDES_ENABLED || (o.region === undefined && o.hour === undefined && o.watchLimit === undefined)) return null;
  const parts = [
    o.region && `Region: ${INDIAN_REGIONS[o.region] ?? o.region} (${o.region})`,
    o.hour !== undefined && `Time: ${String(o.hour).padStart(2, "0")}:xx IST`,
    o.watchLimit !== undefined && `Watch limit: ${o.watchLimit}s`,
  ].filter(Boolean);
  return (
    <div
      className="fixed bottom-3 left-3 z-[100] flex items-center gap-2 rounded-full border-2 border-dashed border-fuchsia-500 bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
      data-testid="test-override-badge"
    >
      <FlaskConical className="w-4 h-4" />
      TEST OVERRIDE · {parts.join(" · ")}
      <a href="?testReset=1" className="underline opacity-90 hover:opacity-100">
        clear
      </a>
    </div>
  );
}
