import express from "express";
import cors from "cors";
import { recipeRouter } from "./routes/recipes";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/images", express.static(path.join(__dirname, "data/img")));

// Routes
// possibility to add further sub-files later
app.use("/api/recipes", recipeRouter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env["PORT"] || 3000;
app.listen(PORT, () => {
  console.log(`FoodieFlip API server running at http://localhost:${PORT}`);
  console.log(`For Recipes Try: http://localhost:${PORT}/api/recipes`);
});
