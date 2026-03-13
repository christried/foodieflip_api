import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { Recipe } from "../generated/prisma";

export const recipeRouter = Router();

// Helper function that returns both imageURLs for now - will replace later on after Digital Ocean is running
function buildImageUrls(
  req: Request,
  recipe: Pick<Recipe, "id" | "imagePath">,
) {
  const base = `${req.protocol}://${req.get("host")}/api/images/${recipe.id}`;
  const fullsizePath = recipe.imagePath.replace(".jpg", "_fullsize.jpg");
  return {
    imageUrl: `${base}/${recipe.imagePath}`,
    fullsizeUrl: `${base}/${fullsizePath}`,
  };
}

// GET /api/recipes/random/:complexity
recipeRouter.get("/random/:complexity", async (req: Request, res: Response) => {
  const complexity = req.params.complexity;
  const latestRecipeId = req.query.id as string | undefined;

  const maxTime =
    complexity === "quick" ? 20 : complexity === "ordinary" ? 40 : 999;
  const minTime =
    complexity === "quick" ? 0 : complexity === "ordinary" ? 21 : 41;

  const recipes = await prisma.recipe.findMany({
    where: {
      time: { gte: minTime, lte: maxTime },
      NOT: latestRecipeId ? { id: latestRecipeId } : undefined,
    },
  });

  if (recipes.length === 0) {
    res.status(404).json({ error: "No recipe for that timeType found" });
    return;
  }

  const randomRecipe = recipes[Math.floor(Math.random() * recipes.length)];
  res.json({ ...randomRecipe, ...buildImageUrls(req, randomRecipe) });
});

// PATCH /api/recipes/vote
recipeRouter.patch("/vote", async (req: Request, res: Response) => {
  const id = req.body.id as string;
  const voteType = req.body.voteType;

  if (voteType !== "upvote" && voteType !== "downvote") {
    res.status(400).json({
      error: "Invalid vote type. Must be 'upvote' or 'downvote'.",
    });
    return;
  }

  try {
    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        upvotes: voteType === "upvote" ? { increment: 1 } : undefined,
        downvotes: voteType === "downvote" ? { increment: 1 } : undefined,
      },
    });

    res.json({
      message: `Successfully ${voteType}d recipe`,
      recipe: {
        id: recipe.id,
        title: recipe.title,
        upvotes: recipe.upvotes,
        downvotes: recipe.downvotes,
      },
    });
  } catch {
    res.status(404).json({ error: `Recipe with id ${id} doesn't exist` });
  }
});

// GET /api/recipes/:shortTitle
recipeRouter.get("/:shortTitle", async (req: Request, res: Response) => {
  const shortTitle = req.params["shortTitle"] as string;

  const recipe = await prisma.recipe.findUnique({ where: { shortTitle } });
  if (!recipe) {
    res
      .status(404)
      .json({ error: `Recipe with shortTitle ${shortTitle} doesn't exist` });
    return;
  }

  res.json({ ...recipe, ...buildImageUrls(req, recipe) });
});
