const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const path = require("path");

const PORT = process.env.PORT || 4100;

// [C-1] DATABASE_URL must be set via environment - no fallback
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

// [M-1] HTML escape function for input sanitization
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// [M-2] Forbidden nickname patterns
const FORBIDDEN_NICKNAMES = [
  /관리자/i,
  /운영자/i,
  /admin/i,
  /operator/i,
  /moderator/i,
  /system/i,
];

function isNicknameForbidden(nickname) {
  return FORBIDDEN_NICKNAMES.some((pattern) => pattern.test(nickname));
}

// Extract first IP from X-Forwarded-For (trusts only the left-most entry from upstream Caddy)
function extractIp(xff, fallback) {
  if (!xff || typeof xff !== "string") return fallback;
  const first = xff.split(",")[0].trim();
  return first || fallback;
}

// --- DB Setup ---
// [L-4] Reduced pool size from 50 to 20
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '익명의 개발자',
      message TEXT NOT NULL,
      ip TEXT,
      device_token TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS device_token TEXT;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_agent TEXT;
    CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_device_token ON comments(device_token);

    CREATE TABLE IF NOT EXISTS flowers (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO flowers (id, count) VALUES (1, 0) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      comment_id INTEGER,
      reason TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      last_action TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_time ON rate_limits(last_action);

    CREATE TABLE IF NOT EXISTS incense (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO incense (id, count) VALUES (1, 0) ON CONFLICT DO NOTHING;
  `);
  const res = await pool.query("SELECT count FROM flowers WHERE id = 1");
  const incRes = await pool.query("SELECT count FROM incense WHERE id = 1");
  return { flowerCount: res.rows[0].count, incenseCount: incRes.rows[0].count };
}

// --- In-memory flower buffer ---
let flowerBuffer = 0;
let flowerTotal = 0;

// --- Incense replace state (global, single-writer) ---
const INCENSE_REPLACE_MS = 2800;
let incenseTotal = 0;
const incenseState = { replacing: false, endsAt: 0 };

async function flushFlowers() {
  if (flowerBuffer > 0) {
    const buf = flowerBuffer;
    flowerBuffer = 0;
    await pool.query("UPDATE flowers SET count = count + $1 WHERE id = 1", [buf]);
  }
}
setInterval(flushFlowers, 10000);

// --- Rate limiting (memory + PostgreSQL persistence) ---
const rateLimits = new Map();
const RATE_LIMIT_TTL_MS = 3600000;

// Restore recent rate limit entries from DB on startup so a container restart
// doesn't reset active cooldowns. Only the last hour is loaded since cooldowns
// in this service never exceed 30s.
async function restoreRateLimits() {
  try {
    const res = await pool.query(
      "SELECT key, last_action FROM rate_limits WHERE last_action > NOW() - INTERVAL '1 hour'"
    );
    for (const row of res.rows) {
      rateLimits.set(row.key, new Date(row.last_action).getTime());
    }
    console.log(`Restored ${res.rows.length} rate limit entries from DB`);
  } catch (e) {
    console.error("Rate limit restore failed:", e.message);
  }
}

// Persist a rate limit key asynchronously - failure doesn't block the request
// because in-memory map is the authoritative read path. DB is for durability
// across restarts only.
function persistRateLimit(key) {
  pool.query(
    "INSERT INTO rate_limits (key, last_action) VALUES ($1, NOW()) ON CONFLICT (key) DO UPDATE SET last_action = NOW()",
    [key]
  ).catch((e) => console.error("Rate limit persist failed:", e.message));
}

function checkRate(ip, action, cooldownMs, deviceToken) {
  const keyIp = `${ip}:${action}`;
  const keyDt = deviceToken ? `dt:${deviceToken}:${action}` : null;
  const now = Date.now();
  const lastIp = rateLimits.get(keyIp) || 0;
  const lastDt = keyDt ? (rateLimits.get(keyDt) || 0) : 0;
  if (now - lastIp < cooldownMs || now - lastDt < cooldownMs) return false;
  rateLimits.set(keyIp, now);
  persistRateLimit(keyIp);
  if (keyDt) {
    rateLimits.set(keyDt, now);
    persistRateLimit(keyDt);
  }
  return true;
}

// Memory cleanup: drop entries older than 1h (covers the longest cooldown with margin)
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of rateLimits) {
    if (now - ts > RATE_LIMIT_TTL_MS) rateLimits.delete(key);
  }
}, 60000);

// DB cleanup: purge rate_limits rows older than 1h every 10 minutes
setInterval(() => {
  pool.query("DELETE FROM rate_limits WHERE last_action < NOW() - INTERVAL '1 hour'")
    .catch((e) => console.error("Rate limit DB cleanup failed:", e.message));
}, 600000);

// --- Express ---
const app = express();

// [L-1] Disable X-Powered-By header
app.disable("x-powered-by");

app.disable("etag");
app.use(express.json({ limit: "1kb" }));

// HTTP rate limiting per IP (60 requests per minute)
const httpRateMap = new Map();
app.use((req, res, next) => {
  const ip = extractIp(req.headers["x-forwarded-for"], req.socket.remoteAddress);
  const now = Date.now();
  const windowMs = 60000;
  const maxReq = 60;
  if (!httpRateMap.has(ip)) {
    httpRateMap.set(ip, []);
  }
  const timestamps = httpRateMap.get(ip).filter(t => now - t < windowMs);
  if (timestamps.length >= maxReq) {
    return res.status(429).json({ error: "Too many requests" });
  }
  timestamps.push(now);
  httpRateMap.set(ip, timestamps);
  next();
});
// Clean HTTP rate map every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of httpRateMap) {
    const filtered = ts.filter(t => now - t < 60000);
    if (filtered.length === 0) httpRateMap.delete(ip);
    else httpRateMap.set(ip, filtered);
  }
}, 120000);
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: function(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    } else {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }
  }
}));

app.get("/api/comments", async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const comments = await pool.query(
      "SELECT id, nickname, message, created_at FROM comments ORDER BY created_at DESC LIMIT 50 OFFSET $1",
      [page * 50]
    );
    const total = await pool.query("SELECT COUNT(*) as cnt FROM comments");
    res.json({
      comments: comments.rows,
      total: parseInt(total.rows[0].cnt),
      page,
      hasMore: (page + 1) * 50 < parseInt(total.rows[0].cnt)
    });
  } catch (e) {
    // [H-5] Sanitized error response
    console.error("API error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) as cnt FROM comments");
    res.json({ flowers: flowerTotal, comments: parseInt(total.rows[0].cnt) });
  } catch (e) {
    // [H-5] Sanitized error response
    console.error("API error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});


// --- History API with in-memory cache ---
let historyCache = { data: null, total: 0, expiry: 0 };
const HISTORY_CACHE_MS = 5000;

app.get("/api/history", async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = page * limit;

    // Cache only first page (hot path)
    if (page === 0 && historyCache.expiry > Date.now()) {
      res.setHeader("Cache-Control", "public, max-age=5");
      return res.json(historyCache.data);
    }

    const [comments, total] = await Promise.all([
      pool.query(
        "SELECT id, nickname, message, created_at FROM comments ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*) as cnt FROM comments"),
    ]);

    const result = {
      comments: comments.rows,
      total: parseInt(total.rows[0].cnt),
      page,
      hasMore: offset + limit < parseInt(total.rows[0].cnt),
    };

    if (page === 0) {
      historyCache = { data: result, total: result.total, expiry: Date.now() + HISTORY_CACHE_MS };
    }

    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(result);
  } catch (e) {
    console.error("History API error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invalidate history cache on new comment
function invalidateHistoryCache() {
  historyCache.expiry = 0;
}

// [L-2] Custom 404 handler (registered after static + API routes, before server.listen)
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- HTTP + Socket.io ---
const server = http.createServer(app);
const io = new Server(server, {
  perMessageDeflate: false,
  maxHttpBufferSize: 1e6,
  pingTimeout: 30000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  // [H-2] Restricted CORS origin
  cors: { origin: ["https://boj-memorial.brian-dev.cloud", "https://boj-memorial.duckdns.org"] }
});

let onlineCount = 0;

// Socket.io connection rate limiting (max 5 connections per IP per minute)
const socketRateMap = new Map();
io.use((socket, next) => {
  const ip = extractIp(socket.handshake.headers["x-forwarded-for"], socket.handshake.address);
  const now = Date.now();
  if (!socketRateMap.has(ip)) socketRateMap.set(ip, []);
  const ts = socketRateMap.get(ip).filter(t => now - t < 60000);
  if (ts.length >= 5) {
    return next(new Error("Too many connections"));
  }
  ts.push(now);
  socketRateMap.set(ip, ts);
  next();
});

// [M-3] Per-socket event flood protection
const socketEventCounters = new Map();
setInterval(() => {
  socketEventCounters.clear();
}, 60000);

io.on("connection", (socket) => {
  onlineCount++;
  io.emit("online", onlineCount);
  const ip = extractIp(socket.handshake.headers["x-forwarded-for"], socket.handshake.address);
  const userAgent = (socket.handshake.headers["user-agent"] || "").slice(0, 500);

  // [M-3] Event counter middleware
  socketEventCounters.set(socket.id, 0);
  const originalOnevent = socket.onevent;
  socket.onevent = function(packet) {
    const count = (socketEventCounters.get(socket.id) || 0) + 1;
    socketEventCounters.set(socket.id, count);
    if (count > 100) {
      console.error("Socket flood detected, disconnecting:", socket.id);
      socket.disconnect(true);
      return;
    }
    originalOnevent.call(socket, packet);
  };

  socket.on("flower", (data) => {
    const dt = data && data.deviceToken ? data.deviceToken : null;
    if (!checkRate(ip, "flower", 2000, dt)) {
      socket.emit("rate:limited", { seconds: 2 });
      return;
    }
    flowerBuffer++;
    flowerTotal++;
    io.emit("flower:update", flowerTotal);
    io.emit("flower:animation", {});
  });

  socket.on("comment", async (data) => {
    const dt = data && data.deviceToken ? data.deviceToken : null;
    if (!checkRate(ip, "comment", 5000, dt)) {
      socket.emit("rate:limited", { seconds: 5 });
      return;
    }
    if (!data || !data.message || typeof data.message !== "string") return;
    let nickname = (data.nickname || "").trim().slice(0, 30) || "\uC775\uBA85\uC758 \uAC1C\uBC1C\uC790";
    const message = data.message.trim().slice(0, 500);
    if (!message) return;

    // [M-2] Forbidden nickname check
    if (isNicknameForbidden(nickname)) {
      socket.emit("comment:error", { error: "사용할 수 없는 닉네임입니다." });
      return;
    }

    // [M-1] Sanitize inputs before DB insert
    nickname = escapeHtml(nickname);
    const sanitizedMessage = escapeHtml(message);
    const deviceToken = typeof dt === "string" ? dt.slice(0, 100) : null;

    try {
      const result = await pool.query(
        "INSERT INTO comments (nickname, message, ip, device_token, user_agent) VALUES ($1, $2, $3, $4, $5) RETURNING id, nickname, message, created_at",
        [nickname, sanitizedMessage, ip, deviceToken, userAgent]
      );
      const comment = result.rows[0];
      // Each comment = one flower
      flowerBuffer++;
      flowerTotal++;
      invalidateHistoryCache();
      io.emit("comment:new", comment);
      io.emit("flower:update", flowerTotal);
      io.emit("flower:animation", {});
    } catch (e) {
      console.error("Comment insert error:", e.message);
    }
  });

  socket.on("report", async (data) => {
    const dt = data && data.deviceToken ? data.deviceToken : null;
    if (!checkRate(ip, "report", 30000, dt)) {
      socket.emit("rate:limited", { seconds: 30 });
      return;
    }
    if (!data || !data.reason || typeof data.reason !== "string") return;
    const reason = data.reason.trim().slice(0, 500);
    if (!reason) return;
    const commentId = Number.isInteger(data.commentId) && data.commentId > 0 ? data.commentId : null;
    try {
      await pool.query(
        "INSERT INTO reports (comment_id, reason, ip) VALUES ($1, $2, $3)",
        [commentId, reason, ip]
      );
      socket.emit("report:ack");
    } catch (e) {
      console.error("Report insert error:", e.message);
    }
  });

  socket.on("incense:replace", async () => {
    const dt = null;
    if (!checkRate(ip, "incense", 3000, null)) {
      socket.emit("rate:limited", { seconds: 3 });
      return;
    }
    if (incenseState.replacing) {
      socket.emit("incense:busy", { endsAt: incenseState.endsAt });
      return;
    }
    incenseState.replacing = true;
    incenseState.endsAt = Date.now() + INCENSE_REPLACE_MS;
    incenseTotal++;
    io.emit("incense:replacing:start", {
      durationMs: INCENSE_REPLACE_MS,
      count: incenseTotal,
    });
    try {
      await pool.query("UPDATE incense SET count = $1 WHERE id = 1", [incenseTotal]);
    } catch (e) {
      console.error("Incense count persist failed:", e.message);
    }
    setTimeout(() => {
      incenseState.replacing = false;
      io.emit("incense:replacing:end", { count: incenseTotal });
    }, INCENSE_REPLACE_MS);
  });

  // Send current incense state to newly connected client
  {
    const remaining = incenseState.replacing
      ? Math.max(0, incenseState.endsAt - Date.now())
      : 0;
    socket.emit("incense:state", {
      replacing: incenseState.replacing,
      durationMs: remaining,
      count: incenseTotal,
    });
  }

  socket.on("disconnect", () => {
    onlineCount = Math.max(0, onlineCount - 1);
    io.emit("online", onlineCount);
    socketEventCounters.delete(socket.id);
  });
});

// Broadcast online count every 5s
setInterval(() => {
  io.emit("online", onlineCount);
}, 5000);

// Graceful shutdown
async function shutdown() {
  await flushFlowers();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start
initDB().then(async (counts) => {
  flowerTotal = counts.flowerCount;
  incenseTotal = counts.incenseCount;
  await restoreRateLimits();
  server.listen(PORT, () => {
    console.log(`BOJ Memorial running on port ${PORT} (PostgreSQL, incense=${incenseTotal})`);
  });
}).catch((e) => {
  console.error("DB init failed:", e.message);
  process.exit(1);
});
