export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/visit" && request.method === "POST") {
      const fetchSite = request.headers.get("sec-fetch-site");

      if (fetchSite && fetchSite !== "same-origin") {
        return new Response(null, { status: 403 });
      }

      let path = "/";
      const referer = request.headers.get("referer");

      if (referer) {
        try {
          const referringUrl = new URL(referer);

          if (referringUrl.origin === url.origin) {
            path = referringUrl.pathname;
          }
        } catch {
          // Keep the default path when the Referer header is malformed.
        }
      }

      console.log({
        event_type: "page_view",
        city: request.cf?.city || "Unknown",
        region: request.cf?.region || "Unknown",
        country: request.cf?.country || "Unknown",
        path,
      });

      return new Response(null, {
        status: 204,
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
