import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const { default: worker } = await import("./index.mjs");

const ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";
const ACCESS_AUD = "test-audience";

function createEnvironment(overrides = {}) {
  return {
    ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    API_TOKEN: "test-token",
    ACCESS_TEAM_DOMAIN,
    ACCESS_AUD,
    VISITOR_HASH_SALT: "test-visitor-hash-salt",
    ASSETS: {
      fetch: async () => new Response("asset", { status: 200 }),
    },
    VISITS: {
      writeDataPoint() {},
    },
    ...overrides,
  };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createAccessFixture() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const keyId = `test-key-${crypto.randomUUID()}`;
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  publicJwk.kid = keyId;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "RS256", kid: keyId }));
  const encodedClaims = base64Url(JSON.stringify({
    aud: [ACCESS_AUD],
    exp: now + 300,
    iat: now,
    iss: `https://${ACCESS_TEAM_DOMAIN}`,
    nbf: now - 5,
    type: "app",
  }));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return {
    publicJwk,
    token: `${signingInput}.${Buffer.from(signature).toString("base64url")}`,
  };
}

test("records visits and protects the private analytics routes", async () => {
  let writtenPoint = null;
  const environment = createEnvironment({
    VISITS: {
      writeDataPoint(point) {
        writtenPoint = point;
      },
    },
  });
  const visitRequest = new Request("https://example.com/api/visit", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "203.0.113.42",
      origin: "https://example.com",
      referer: "https://example.com/research/",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 Test Browser",
    },
  });
  Object.defineProperty(visitRequest, "cf", {
    value: {
      city: "Shanghai",
      country: "CN",
      latitude: "31.2304",
      longitude: "121.4737",
      region: "Shanghai",
      asn: 4134,
      asOrganization: "China Telecom",
    },
  });

  const visitResponse = await worker.fetch(visitRequest, environment);
  assert.equal(visitResponse.status, 204);
  assert.deepEqual(writtenPoint.blobs.slice(0, 5), [
    "Shanghai",
    "Shanghai",
    "CN",
    "/research/",
    "203.0.113.xxx",
  ]);
  assert.match(writtenPoint.blobs[5], /^v-[a-f0-9]{20}$/);
  assert.deepEqual(writtenPoint.blobs.slice(6), [
    "AS4134",
    "China Telecom",
    "家庭/运营商",
    "未发现异常",
  ]);
  assert.deepEqual(writtenPoint.doubles, [31.2304, 121.4737]);
  assert.deepEqual(writtenPoint.indexes, [writtenPoint.blobs[5]]);

  const privateResponse = await worker.fetch(
    new Request("https://example.com/analytics/data"),
    environment,
  );
  assert.equal(privateResponse.status, 401);
});

test("validates Access JWTs and returns normalized city data", async () => {
  const fixture = await createAccessFixture();
  const submittedQueries = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url.endsWith("/cdn-cgi/access/certs")) {
      return Response.json({ keys: [fixture.publicJwk] });
    }

    if (url.includes("/analytics_engine/sql")) {
      submittedQueries.push(init.body);

      if (init.body.includes("blob6 AS visitor_id")) {
        return Response.json({
          data: [
            {
              masked_ip: "203.0.113.xxx",
              visitor_id: "v-0123456789abcdef0123",
              asn: "AS4134",
              organization: "China Telecom",
              network_type: "家庭/运营商",
              bot_status: "未发现异常",
              visits: 3,
              last_seen: "2026-09-12 03:30:00.000",
            },
          ],
        });
      }

      return Response.json({
        data: [
          {
            city: "Shanghai",
            region: "Shanghai",
            country: "CN",
            latitude: 31.2304,
            longitude: 121.4737,
            visits: 12,
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await worker.fetch(
      new Request("https://example.com/analytics/data?days=30", {
        headers: { "cf-access-jwt-assertion": fixture.token },
      }),
      createEnvironment(),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rangeDays, 30);
    assert.equal(body.cities[0].city, "Shanghai");
    assert.equal(body.cities[0].visits, 12);
    assert.match(submittedQueries[0], /INTERVAL '30' DAY/);
    assert.match(submittedQueries[0], /SUM\(_sample_interval\) AS visits/);

    const cityResponse = await worker.fetch(
      new Request("https://example.com/analytics/city?days=7&city=Xi%27an&region=Shaanxi&country=CN", {
        headers: { "cf-access-jwt-assertion": fixture.token },
      }),
      createEnvironment(),
    );
    const cityBody = await cityResponse.json();

    assert.equal(cityResponse.status, 200);
    assert.equal(cityBody.visitors[0].maskedIp, "203.0.113.xxx");
    assert.equal(cityBody.visitors[0].networkType, "家庭/运营商");
    assert.match(submittedQueries[1], /blob1 = 'Xi''an'/);
    assert.match(submittedQueries[1], /AND blob6 != ''/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
