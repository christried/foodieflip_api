import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { recipeRouter } from "./routes/recipes";
import { feedbackRouter } from "./routes/feedback";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

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
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
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

app.use("/api/images", express.static(path.join(process.cwd(), "data/img")));

// Routes
// possibility to add further sub-files later
app.use("/api/recipes", recipeRouter);
app.use("/api/feedback", feedbackRouter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`FoodieFlip API server running at http://localhost:${PORT}`);
  console.log(`For Recipes Try: http://localhost:${PORT}/api/recipes`);
  console.log(`For Feedback Try: http://localhost:${PORT}/api/feedback`);
});
