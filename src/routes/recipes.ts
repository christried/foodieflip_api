import { Router, Request, Response } from "express";
import { Recipe } from "../recipe.model";
import * as fs from "fs";
import * as path from "path";

export const recipeRouter = Router();
const recipes = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/recipes.json"), "utf-8"),
);

// In-memory data store
// to be replaced with a real database
let recipeList = [...recipes];

// GET /api/recipes
recipeRouter.get("/", (_req: Request, res: Response) => {
  res.json(recipeList);
});

// GET /api/recipes/random/:complexity
recipeRouter.get("/random/:complexity", (req: Request, res: Response) => {
  const complexity = req.params.complexity;
  const maxTime =
    complexity === "quick" ? 20 : complexity === "ordinary" ? 45 : 999;

  const minTime =
    complexity === "quick" ? 0 : complexity === "ordinary" ? 21 : 46;

  const recipes: Recipe[] = recipeList.filter(
    (r) => r.time <= maxTime && r.time >= minTime,
  );
  if (recipes.length === 0) {
    res.status(404).json({ error: "No recipe for that timeType found" });
    return;
  }

  const randomRecipe = recipes[Math.floor(Math.random() * recipes.length)];
  const fullsizePath = randomRecipe.imagePath.replace(".jpg", "_fullsize.jpg");

  const recipeWithImage = {
    ...randomRecipe,
    imageUrl: `${req.protocol}://${req.get("host")}/api/images/${randomRecipe.id}/${randomRecipe.imagePath}`,
    fullsizeUrl: `${req.protocol}://${req.get("host")}/api/images/${randomRecipe.id}/${fullsizePath}`,
  };

  res.json(recipeWithImage);
});

// PATCH /api/recipes/vote
recipeRouter.patch("/vote", (req: Request, res: Response) => {
  const id = req.body.id;
  const voteType = req.body.voteType;

  if (voteType !== "upvote" && voteType !== "downvote") {
    res.status(400).json({
      error: "Invalid vote type. Must be 'upvote' or 'downvote'.",
    });
    return;
  }

  // Find recipe in memory
  const recipe = recipeList.find((r) => r.id === id);
  if (!recipe) {
    res.status(404).json({ error: `Recipe with id ${id} doesn't exist` });
    return;
  }

  if (voteType === "upvote") {
    recipe.upvotes++;
  } else {
    recipe.downvotes++;
  }

  // Persist to file
  try {
    const filePath = path.join(process.cwd(), "data", "recipes.json");
    fs.writeFileSync(filePath, JSON.stringify(recipeList, null, 2), "utf-8");

    res.json({
      message: `Successfully ${voteType}d recipe`,
      recipe: {
        id: recipe.id,
        title: recipe.title,
        upvotes: recipe.upvotes,
        downvotes: recipe.downvotes,
      },
    });
  } catch (error) {
    console.error("File write error:", error);
    res.status(500).json({
      error: "Failed to persist vote in storage",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
