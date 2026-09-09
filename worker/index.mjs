const ALLOWED_RANGES = new Set([1, 7, 30, 90]);
const ANALYTICS_DATASET = "website_visits";
const ACCESS_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

let accessKeyCache = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/visit") {
      return handleVisit(request, env, url);
    }

    if (isAnalyticsPath(url.pathname)) {
      return handleAnalytics(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

function handleVisit(request, env, url) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST" },
    });
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (
    (fetchSite && fetchSite !== "same-origin") ||
    (origin && origin !== url.origin)
  ) {
    return new Response(null, { status: 403 });
  }

  const city = normalizeText(request.cf?.city, "Unknown", 120);
  const region = normalizeText(request.cf?.region, "Unknown", 120);
  const country = normalizeText(request.cf?.country, "Unknown", 8);
  const latitude = normalizeCoordinate(request.cf?.latitude, -90, 90);
  const longitude = normalizeCoordinate(request.cf?.longitude, -180, 180);
  const path = getReferringPath(request, url);

  console.log({
    event_type: "page_view",
    city,
    region,
    country,
    path,
  });

  try {
    env.VISITS.writeDataPoint({
      blobs: [city, region, country, path],
      doubles: [latitude, longitude],
      indexes: [crypto.randomUUID()],
    });
  } catch (error) {
    console.error("Unable to write visit analytics", error);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
    },
  });
}

async function handleAnalytics(request, env, url) {
  const isAuthenticated = await verifyAccessRequest(request, env);

  if (!isAuthenticated) {
    return jsonResponse(
      { error: "Cloudflare Access authentication is required." },
      401,
    );
  }

  if (url.pathname === "/analytics/data") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, {
        allow: "GET",
      });
    }

    return queryAnalytics(env, url);
  }

  const assetResponse = await env.ASSETS.fetch(request);
  const headers = new Headers(assetResponse.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self'; img-src 'self' data: https://unpkg.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

async function queryAnalytics(env, url) {
  if (!env.ACCOUNT_ID || !env.API_TOKEN) {
    return jsonResponse(
      { error: "Analytics API credentials have not been configured." },
      503,
    );
  }

  const requestedDays = Number.parseInt(url.searchParams.get("days") || "7", 10);
  const days = ALLOWED_RANGES.has(requestedDays) ? requestedDays : 7;
  const query = `
    SELECT
      blob1 AS city,
      blob2 AS region,
      blob3 AS country,
      SUM(_sample_interval * double1) / SUM(_sample_interval) AS latitude,
      SUM(_sample_interval * double2) / SUM(_sample_interval) AS longitude,
      SUM(_sample_interval) AS visits
    FROM ${ANALYTICS_DATASET}
    WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
      AND blob1 != 'Unknown'
      AND NOT (double1 = 0 AND double2 = 0)
    GROUP BY city, region, country
    ORDER BY visits DESC
    LIMIT 500`;

  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`;
    const queryResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.API_TOKEN}`,
        "content-type": "text/plain; charset=UTF-8",
      },
      body: query,
    });

    if (!queryResponse.ok) {
      console.error("Analytics Engine query failed", {
        status: queryResponse.status,
      });
      return jsonResponse({ error: "Unable to load analytics data." }, 502);
    }

    const result = await queryResponse.json();
    const cities = Array.isArray(result.data)
      ? result.data.map(normalizeCityRow).filter(Boolean)
      : [];

    return jsonResponse({
      rangeDays: days,
      generatedAt: new Date().toISOString(),
      cities,
    });
  } catch (error) {
    console.error("Analytics Engine request failed", error);
    return jsonResponse({ error: "Unable to load analytics data." }, 502);
  }
}

function normalizeCityRow(row) {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const visits = Math.max(0, Math.round(Number(row.visits)));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(visits) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    city: normalizeText(row.city, "Unknown", 120),
    region: normalizeText(row.region, "Unknown", 120),
    country: normalizeText(row.country, "Unknown", 8),
    latitude,
    longitude,
    visits,
  };
}

function getReferringPath(request, requestUrl) {
  const referer = request.headers.get("referer");

  if (!referer) {
    return "/";
  }

  try {
    const referringUrl = new URL(referer);

    if (referringUrl.origin === requestUrl.origin) {
      return normalizeText(referringUrl.pathname, "/", 512);
    }
  } catch {
    // Ignore malformed Referer headers.
  }

  return "/";
}

function normalizeText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function normalizeCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : 0;
}

function isAnalyticsPath(pathname) {
  return pathname === "/analytics" || pathname.startsWith("/analytics/");
}

async function verifyAccessRequest(request, env) {
  const token = request.headers.get("cf-access-jwt-assertion");
  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);

  if (!token || !teamDomain || !env.ACCESS_AUD) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  try {
    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);

    if (header.alg !== "RS256" || !header.kid) {
      return false;
    }

    const key = await getAccessKey(teamDomain, header.kid);

    if (!key) {
      return false;
    }

    const signatureIsValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );

    if (!signatureIsValid) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const expectedIssuer = `https://${teamDomain}`;
    const issuer = typeof claims.iss === "string"
      ? claims.iss.replace(/\/$/, "")
      : "";
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

    return (
      issuer === expectedIssuer &&
      audience.includes(env.ACCESS_AUD) &&
      claims.type === "app" &&
      Number.isFinite(claims.exp) &&
      claims.exp > now - 30 &&
      (!Number.isFinite(claims.nbf) || claims.nbf <= now + 30)
    );
  } catch (error) {
    console.error("Cloudflare Access token validation failed", error);
    return false;
  }
}

async function getAccessKey(teamDomain, keyId) {
  const now = Date.now();

  if (
    !accessKeyCache ||
    accessKeyCache.teamDomain !== teamDomain ||
    accessKeyCache.expiresAt <= now
  ) {
    accessKeyCache = await fetchAccessKeys(teamDomain);
  }

  let key = accessKeyCache.keys.get(keyId);

  if (!key) {
    accessKeyCache = await fetchAccessKeys(teamDomain);
    key = accessKeyCache.keys.get(keyId);
  }

  return key || null;
}

async function fetchAccessKeys(teamDomain) {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);

  if (!response.ok) {
    throw new Error(`Unable to fetch Access keys (${response.status})`);
  }

  const payload = await response.json();
  const keys = new Map();

  for (const jwk of payload.keys || []) {
    if (jwk.kid && jwk.kty === "RSA") {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    }
  }

  return {
    teamDomain,
    keys,
    expiresAt: Date.now() + ACCESS_KEY_CACHE_TTL_MS,
  };
}

function normalizeTeamDomain(value) {
  if (typeof value !== "string") {
    return "";
  }

  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(domain) ? domain : "";
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      ...extraHeaders,
    },
  });
}
