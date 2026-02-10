import { Router, Request, Response } from "express";
import recipes from "../data/recipes.json";
import { Recipe } from "../recipe.model";

export const recipeRouter = Router();

// In-memory data store
// to be replaced with a real database
let recipeList = [...recipes];

// GET /api/recipes
recipeRouter.get("/", (_req: Request, res: Response) => {
  res.json(recipeList);
});

// GET /api/recipes/:id
recipeRouter.get("/:id", (req: Request, res: Response) => {
  const recipe = recipeList.find((r) => r.id === req.params.id);
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.json(recipe);
});

// GET /api/recipes/random/:timeType
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

  res.json(randomRecipe);
});
