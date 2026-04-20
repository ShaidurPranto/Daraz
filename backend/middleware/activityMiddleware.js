const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "daraz-dev-secret";

// Fields that must never be stored in audit logs
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "val_id",
  "authorization",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
]);

function stripSensitive(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      cleaned[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      cleaned[k] = stripSensitive(v);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

// Try to decode JWT without throwing — returns null if absent/invalid
function tryDecodeUser(req) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const activityMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  // Intercept res.json to capture response body & status
  const originalJson = res.json.bind(res);
  let capturedBody = null;
  res.json = function (body) {
    capturedBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    // Fire-and-forget: never block the response
    setImmediate(async () => {
      try {
        const decoded = tryDecodeUser(req);
        const userId = decoded?.id || null;
        const userName = decoded?.name || null;
        const userEmail = decoded?.email || null;

        const method = req.method;
        const path = req.originalUrl || req.url;
        const isCartRoute = path.startsWith("/cart");
        const ip = getIp(req);
        const userAgent = req.headers["user-agent"] || null;
        const frontendUrl = req.headers["referer"] || req.headers["origin"] || null;
        const statusCode = res.statusCode;

        const reqBody = req.body && Object.keys(req.body).length > 0
          ? stripSensitive(req.body)
          : null;
        const resBody = capturedBody ? stripSensitive(capturedBody) : null;

        // 1) Upsert user_activity
        if (userId) {
          if (isCartRoute) {
            await pool.query(
              `INSERT INTO user_activity (user_id, last_seen_at, last_cart_activity)
               VALUES ($1, NOW(), NOW())
               ON CONFLICT (user_id) DO UPDATE
               SET last_seen_at = NOW(), last_cart_activity = NOW()`,
              [userId],
            );
          } else {
            await pool.query(
              `INSERT INTO user_activity (user_id, last_seen_at)
               VALUES ($1, NOW())
               ON CONFLICT (user_id) DO UPDATE
               SET last_seen_at = NOW()`,
              [userId],
            );
          }
        }

        if (path.startsWith("/admin/audit-logs") || path.startsWith("/health")) {
          return;
        }

        // 2) Insert audit log
        await pool.query(
          `INSERT INTO audit_logs
             (user_id, user_name, user_email, method, path, frontend_url,
              ip, user_agent, status_code, req_body, res_body)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            userId,
            userName,
            userEmail,
            method,
            path,
            frontendUrl,
            ip,
            userAgent,
            statusCode,
            reqBody ? JSON.stringify(reqBody) : null,
            resBody ? JSON.stringify(resBody) : null,
          ],
        );
      } catch (err) {
        // Logging must never crash the app
        console.error("[ActivityMiddleware] Error:", err.message);
      }
    });
  });

  next();
};

module.exports = activityMiddleware;
