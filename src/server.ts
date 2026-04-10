import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { recipeRouter } from "./routes/recipes";
import { feedbackRouter } from "./routes/feedback";
import { submitRouter } from "./routes/submit";
import { contactRouter } from "./routes/contact";
import dotenv from "dotenv";

dotenv.config();

// Fail fast if required environment variables are missing
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "SESSION_SECRET",
  "COOKIE_NAME",
  "COOKIE_MAX_AGE_MS",
  "TRELLO_API_KEY",
  "TRELLO_API_TOKEN",
  "TRELLO_NEW_IMAGES_LIST_ID",
  "TRELLO_NEW_RECIPES_LIST_ID",
  "TRELLO_FEEDBACK_LIST_ID",
  "SPACES_KEY",
  "SPACES_SECRET",
  "SPACES_ENDPOINT",
  "SPACES_BUCKET",
  "SPACES_CDN_BASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "ADMIN_PANEL_URL_DEV",
  "ADMIN_PANEL_URL_PROD",
] as const;

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(", ")}`,
  );
  process.exit(1);
}

const app = express();
const PORT = process.env["PORT"] || 3000;
const isProduction = process.env["NODE_ENV"] === "production";

const cookieName = process.env["COOKIE_NAME"] || "ff_session";
const cookieMaxAgeMs = Number(process.env["COOKIE_MAX_AGE_MS"] || "1209600000");

if (!Number.isFinite(cookieMaxAgeMs) || cookieMaxAgeMs <= 0) {
  console.error("COOKIE_MAX_AGE_MS must be a positive number.");
  process.exit(1);
}

const parseCsvValues = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeOrigin = (origin: string) => {
  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return "";
  }

  try {
    return new URL(trimmedOrigin).origin;
  } catch {
    return trimmedOrigin.replace(/\/+$/, "");
  }
};

const allowedOrigins = parseCsvValues(
  process.env["ALLOWED_ORIGINS"] || "http://localhost:4200",
)
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOriginSet = new Set(allowedOrigins);

const sessionPool = new Pool({
  connectionString: process.env["DATABASE_URL"],
});

sessionPool.on("error", (error) => {
  console.error("Unexpected Postgres session pool error:", error);
});

const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({
  pool: sessionPool,
  tableName: "user_sessions",
  createTableIfMissing: true,
});

// Heroku runs behind a reverse proxy, so trust the first hop.
app.set("trust proxy", 1);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOriginSet.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  }),
);

// Security headers
app.use(helmet());

// Body size limit — reject payloads larger than 10 KB
app.use(express.json({ limit: "10kb" }));

app.use(
  session({
    name: cookieName,
    secret: process.env["SESSION_SECRET"]!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: cookieMaxAgeMs,
    },
  }),
);

// Global rate limiter — 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

// Routes
// possibility to add further sub-files later
app.use("/api/recipes", recipeRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/submit", submitRouter);
app.use("/api/contact", contactRouter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`FoodieFlip API server running at http://localhost:${PORT}`);
  console.log(`For Recipes Try: http://localhost:${PORT}/api/recipes`);
  console.log(`For Feedback Try: http://localhost:${PORT}/api/feedback`);
  console.log(`For Submissions Try: http://localhost:${PORT}/api/submit`);
  console.log(`For Contact Try: http://localhost:${PORT}/api/contact`);
});
