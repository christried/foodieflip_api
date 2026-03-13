import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { Recipe } from "../generated/prisma";

export const recipeRouter = Router();

const ALLOWED_COMPLEXITIES = ["quick", "ordinary", "complex"] as const;
const RESERVED_RECIPE_SLUGS = new Set(["random", "vote"]);

function isAllowedComplexity(
  value: string,
): value is (typeof ALLOWED_COMPLEXITIES)[number] {
  return ALLOWED_COMPLEXITIES.includes(
    value as (typeof ALLOWED_COMPLEXITIES)[number],
  );
}

function buildImageUrls(
  recipe: Pick<Recipe, "id" | "imageExtension">,
) {
  const cdnBase = process.env["SPACES_CDN_BASE_URL"] as string;
  const extension = recipe.imageExtension.toLowerCase() || "jpg";
  const originalPath = `original.${extension}`;
  const mediumPath = `medium-300w.${extension}`;

  const base = `${cdnBase}/images/${recipe.id}`;
  return {
    imageExtension: extension,
    imageUrl: `${base}/${mediumPath}`,
    fullsizeUrl: `${base}/${originalPath}`,
  };
}

function toPublicRecipe(recipe: Recipe) {
  return { ...recipe, ...buildImageUrls(recipe) };
}

// GET /api/recipes/random/:complexity
recipeRouter.get("/random/:complexity", async (req: Request, res: Response) => {
  const complexityParam = req.params.complexity;
  const complexity =
    typeof complexityParam === "string"
      ? complexityParam
      : (complexityParam?.[0] ?? "");
  const latestRecipeId = req.query.id as string | undefined;

  if (!isAllowedComplexity(complexity)) {
    res.status(400).json({
      error: "Invalid complexity. Must be one of: quick, ordinary, complex.",
    });
    return;
  }

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
  res.json(toPublicRecipe(randomRecipe));
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

  if (RESERVED_RECIPE_SLUGS.has(shortTitle.toLowerCase())) {
    res
      .status(404)
      .json({ error: `Recipe with shortTitle ${shortTitle} doesn't exist` });
    return;
  }

  const recipe = await prisma.recipe.findUnique({ where: { shortTitle } });
  if (!recipe) {
    res
      .status(404)
      .json({ error: `Recipe with shortTitle ${shortTitle} doesn't exist` });
    return;
  }

  res.json(toPublicRecipe(recipe));
});
