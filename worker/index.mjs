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

async function handleVisit(request, env, url) {
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
  const ipAddress = normalizeText(
    request.headers.get("cf-connecting-ip"),
    "",
    64,
  );
  const userAgent = normalizeText(request.headers.get("user-agent"), "", 512);
  const asn = normalizeAsn(request.cf?.asn);
  const organization = normalizeText(
    request.cf?.asOrganization,
    "Unknown",
    160,
  );
  const maskedIp = maskIpAddress(ipAddress);
  const visitorId = await createVisitorId(
    ipAddress,
    userAgent,
    env.VISITOR_HASH_SALT,
  );
  const networkType = inferNetworkType(organization);
  const botStatus = inferBotStatus(userAgent, request.cf?.botManagement);

  console.log({
    event_type: "page_view",
    city,
    region,
    country,
    path,
    asn,
    network_type: networkType,
    suspected_bot: botStatus !== "未发现异常",
  });

  try {
    env.VISITS.writeDataPoint({
      blobs: [
        city,
        region,
        country,
        path,
        maskedIp,
        visitorId,
        asn,
        organization,
        networkType,
        botStatus,
      ],
      doubles: [latitude, longitude],
      indexes: [visitorId],
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

  if (url.pathname === "/analytics/city") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, {
        allow: "GET",
      });
    }

    return queryCityVisitors(env, url);
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
    const rows = await runAnalyticsQuery(env, query);
    const cities = rows.map(normalizeCityRow).filter(Boolean);

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

async function queryCityVisitors(env, url) {
  if (!env.ACCOUNT_ID || !env.API_TOKEN) {
    return jsonResponse(
      { error: "Analytics API credentials have not been configured." },
      503,
    );
  }

  const requestedDays = Number.parseInt(url.searchParams.get("days") || "7", 10);
  const days = ALLOWED_RANGES.has(requestedDays) ? requestedDays : 7;
  const city = normalizeText(url.searchParams.get("city"), "", 120);
  const region = normalizeText(url.searchParams.get("region"), "Unknown", 120);
  const country = normalizeText(url.searchParams.get("country"), "", 8);

  if (!city || !country) {
    return jsonResponse({ error: "City and country are required." }, 400);
  }

  const query = `
    SELECT
      blob5 AS masked_ip,
      blob6 AS visitor_id,
      blob7 AS asn,
      blob8 AS organization,
      blob9 AS network_type,
      blob10 AS bot_status,
      SUM(_sample_interval) AS visits,
      MAX(timestamp) AS last_seen
    FROM ${ANALYTICS_DATASET}
    WHERE timestamp >= NOW() - INTERVAL '${days}' DAY
      AND blob1 = ${escapeSqlString(city)}
      AND blob2 = ${escapeSqlString(region)}
      AND blob3 = ${escapeSqlString(country)}
      AND blob6 != ''
    GROUP BY masked_ip, visitor_id, asn, organization, network_type, bot_status
    ORDER BY last_seen DESC
    LIMIT 200`;

  try {
    const rows = await runAnalyticsQuery(env, query);
    const visitors = rows.map(normalizeVisitorRow).filter(Boolean);

    return jsonResponse({
      rangeDays: days,
      city: { city, region, country },
      generatedAt: new Date().toISOString(),
      visitors,
    });
  } catch (error) {
    console.error("Analytics Engine city query failed", error);
    return jsonResponse({ error: "Unable to load city visitor data." }, 502);
  }
}

async function runAnalyticsQuery(env, query) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.API_TOKEN}`,
      "content-type": "text/plain; charset=UTF-8",
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Analytics Engine query failed (${response.status})`);
  }

  const result = await response.json();
  return Array.isArray(result.data) ? result.data : [];
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

function normalizeVisitorRow(row) {
  const visitorId = normalizeText(row.visitor_id, "", 64);
  const visits = Math.max(0, Math.round(Number(row.visits)));

  if (!visitorId || !Number.isFinite(visits)) {
    return null;
  }

  return {
    maskedIp: normalizeText(row.masked_ip, "Unknown", 64),
    visitorId,
    asn: normalizeText(row.asn, "AS unknown", 32),
    organization: normalizeText(row.organization, "Unknown", 160),
    networkType: normalizeText(row.network_type, "未知", 32),
    botStatus: normalizeText(row.bot_status, "未知", 32),
    visits,
    lastSeen: normalizeText(row.last_seen, "", 64),
  };
}

function normalizeAsn(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0
    ? `AS${numericValue}`
    : "AS unknown";
}

function maskIpAddress(value) {
  if (!value) {
    return "Unknown";
  }

  const ipv4Match = value.match(/^(?:\d{1,3}\.){3}\d{1,3}$/);

  if (ipv4Match) {
    const octets = value.split(".").map(Number);

    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.xxx`;
    }
  }

  const mappedIpv4 = value.match(/^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/i);

  if (mappedIpv4) {
    return maskIpAddress(mappedIpv4[1]);
  }

  const ipv6Groups = expandIpv6(value);

  if (ipv6Groups) {
    return `${ipv6Groups.slice(0, 3).join(":")}::/48`;
  }

  return "Unknown";
}

function expandIpv6(value) {
  const normalized = value.toLowerCase().split("%")[0];

  if (!/^[0-9a-f:]+$/.test(normalized) || normalized.includes(":::")) {
    return null;
  }

  const halves = normalized.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;

  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    return null;
  }

  const groups = halves.length === 2
    ? [...left, ...Array(missing).fill("0"), ...right]
    : left;

  return groups.length === 8 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))
    ? groups.map((group) => group.padStart(4, "0"))
    : null;
}

async function createVisitorId(ipAddress, userAgent, secret) {
  if (!ipAddress || !secret) {
    return `anon-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${ipAddress}\n${userAgent}`),
  );
  const digest = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `v-${digest.slice(0, 20)}`;
}

function inferNetworkType(organization) {
  const name = organization.toLowerCase();

  if (/amazon|aws|google cloud|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|vultr|oracle cloud|alibaba|aliyun|tencent cloud|cloudflare|leaseweb|choopa|contabo|rackspace|hosting|datacenter|data center/.test(name)) {
    return "云服务器";
  }

  if (/mobile|cellular|wireless|china mobile|vodafone|softbank/.test(name)) {
    return "移动网络";
  }

  if (/university|college|academic|education|research network/.test(name)) {
    return "教育/机构";
  }

  if (/telecom|communications|broadband|cable|fiber|internet service|unicom|comcast|verizon|charter|telefonica|orange|kddi|ntt/.test(name)) {
    return "家庭/运营商";
  }

  return "未知";
}

function inferBotStatus(userAgent, botManagement) {
  if (botManagement?.verifiedBot) {
    return "已验证机器人";
  }

  if (Number.isFinite(botManagement?.score) && botManagement.score < 30) {
    return "疑似机器人";
  }

  if (
    !userAgent ||
    /bot|crawler|spider|slurp|headless|phantomjs|selenium|puppeteer|playwright|curl|wget|python-requests|httpclient|scrapy|go-http-client|facebookexternalhit|preview|monitor|uptime/i.test(userAgent)
  ) {
    return "疑似机器人";
  }

  return "未发现异常";
}

function escapeSqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
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
