"use strict";

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} is required for DBMS Gateway access`);
  }

  return value;
}

function normalizeDbmsUrls(value) {
  const raw = String(value || "").replace(/\/+$/, "");
  if (!raw) return [];

  const urls = [raw];
  if (raw.endsWith("/api")) urls.push(raw.slice(0, -4));

  return [...new Set(urls)];
}

async function readGatewayResponse(response) {
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`DBMS Gateway returned invalid JSON: ${error.message}`);
    }
  }

  if (!response.ok) {
    const message = payload.error || payload.message || `DBMS Gateway request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function compactError(message) {
  return String(message || "").replace(/\s+/g, " ").slice(0, 180);
}

function connectProject(siteId, options = {}) {
  const resolvedSiteId = requireValue("SITE_ID", siteId || options.siteId);
  const apiKey = requireValue("API_KEY", options.apiKey);
  const dbmsUrls = normalizeDbmsUrls(requireValue("DBMS_URL", options.dbmsUrl));
  const timeoutMs = Number(options.timeoutMs || 15000);

  if (!globalThis.fetch) {
    throw new Error("DBMS Gateway access requires Node.js 18+ global fetch");
  }

  async function requestAt(dbmsUrl, path, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${dbmsUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-site-id": resolvedSiteId,
          "x-api-key": apiKey,
          ...(init.headers || {}),
        },
      });

      return await readGatewayResponse(response);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`DBMS Gateway request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestAny(paths, init = {}) {
    const errors = [];

    for (const dbmsUrl of dbmsUrls) {
      for (const path of paths) {
        try {
          return await requestAt(dbmsUrl, path, init);
        } catch (error) {
          errors.push(`${dbmsUrl}${path}: ${compactError(error.message)}`);
        }
      }
    }

    throw new Error(`DBMS Gateway request failed. Tried ${errors.join(" | ")}`);
  }

  async function query(sql, params = []) {
    const payload = await requestAny(["/gateway/query", "/query", "/api/gateway/query"], {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    });

    if (Object.prototype.hasOwnProperty.call(payload, "rows")) return payload.rows;
    if (Object.prototype.hasOwnProperty.call(payload, "result")) return payload.result;
    if (Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;

    return payload;
  }

  const db = {
    siteId: resolvedSiteId,

    query,

    execute(sql, params = []) {
      return query(sql, params);
    },

    status() {
      return requestAny(["/gateway/status", "/status", "/api/gateway/status"], {
        method: "GET",
      });
    },

    async getConnection() {
      return {
        query,
        execute: db.execute,
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      };
    },
  };

  return db;
}

module.exports = { connectProject };
