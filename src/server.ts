import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { recipeRouter } from "./routes/recipes";
import { feedbackRouter } from "./routes/feedback";
import { submitRouter } from "./routes/submit";
import dotenv from "dotenv";

dotenv.config();

// Fail fast if required environment variables are missing
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
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
] as const;

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(", ")}`
  );
  process.exit(1);
}

const app = express();
const PORT = process.env["PORT"] || 3000;

const allowedOrigins = (
  process.env["ALLOWED_ORIGINS"] || "http://localhost:4200"
)
  .split(",")
  .map((o) => o.trim());

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  }),
);

// Security headers
app.use(helmet());

// Body size limit — reject payloads larger than 10 KB
app.use(express.json({ limit: "10kb" }));

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

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`FoodieFlip API server running at http://localhost:${PORT}`);
  console.log(`For Recipes Try: http://localhost:${PORT}/api/recipes`);
  console.log(`For Feedback Try: http://localhost:${PORT}/api/feedback`);
  console.log(`For Submissions Try: http://localhost:${PORT}/api/submit`);
});
