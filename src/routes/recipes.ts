import { Router, Request, Response } from "express";
import recipes from "../data/recipes.json";

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
