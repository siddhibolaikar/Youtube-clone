import { getGeo } from "@/lib/server/geo";
import { withApi } from "@/lib/server/http";

export default withApi(["GET"], async (req, res) => {
  const { city, regionCode, regionName, country, source } = await getGeo(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json({ city, regionCode, regionName, country, source });
});
