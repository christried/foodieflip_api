import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { Recipe, UserRole, Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { DiscordService } from "../utils/discord.service";
import { getAuthUser, requireAuth, requireRole } from "../middleware/auth";
import { SUBMITTED_BY_FALLBACK } from "../constants/recipes";

export const recipeRouter = Router();

const ALLOWED_COMPLEXITIES = ["quick", "ordinary", "complex"] as const;
const RESERVED_RECIPE_SLUGS = new Set(["random", "vote", "mine"]);

interface IngredientSectionDto {
  title: string;
  items: string[];
}

type RecipeWithSubmitter = Recipe & {
  submittedByUser: { username: string | null } | null;
};

const approveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many approvals, please try again later." },
});

function isAllowedComplexity(
  value: string,
): value is (typeof ALLOWED_COMPLEXITIES)[number] {
  return ALLOWED_COMPLEXITIES.includes(
    value as (typeof ALLOWED_COMPLEXITIES)[number],
  );
}

function buildImageUrls(recipe: Pick<Recipe, "id" | "imageExtension">) {
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

function buildPublicRecipeUrl(shortTitle: string): string | undefined {
  const baseUrl =
    process.env["PUBLIC_RECIPE_BASE_URL"]?.trim().replace(/\/$/, "") || "";
  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl}/${encodeURIComponent(shortTitle)}`;
}

function resolveSubmittedBy(recipe: RecipeWithSubmitter): string {
  const username = recipe.submittedByUser?.username?.trim();
  return username || SUBMITTED_BY_FALLBACK;
}

function normalizeIngredientSections(value: Prisma.JsonArray): IngredientSectionDto[] {
  if (value.length === 0) {
    return [];
  }

  return value
    .map((section) => section as Prisma.JsonObject)
    .map((section) => ({
      title: ((section["title"] as string) || "").trim(),
      items: ((section["items"] as string[]) || [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    }))
    .filter((section) => section.title.length > 0 && section.items.length > 0);
}

function toPublicRecipe(recipe: RecipeWithSubmitter) {
  const { submittedByUser, ...recipeData } = recipe;
  return {
    ...recipeData,
    ingredients: normalizeIngredientSections(recipeData.ingredients as Prisma.JsonArray),
    ...buildImageUrls(recipe),
    submittedBy: resolveSubmittedBy(recipe),
  };
}

// GET /api/recipes/pending
recipeRouter.get(
  "/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response) => {
    const pendingRecipes = await prisma.recipe.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        submittedByUser: {
          select: { username: true },
        },
      },
    });

    res.json(pendingRecipes.map(toPublicRecipe));
  },
);

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
      status: "APPROVED",
      time: { gte: minTime, lte: maxTime },
      NOT: latestRecipeId ? { id: latestRecipeId } : undefined,
    },
    include: {
      submittedByUser: {
        select: { username: true },
      },
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
    const existingRecipe = await prisma.recipe.findFirst({
      where: { id, status: "APPROVED" },
    });

    if (!existingRecipe) {
      res.status(404).json({ error: `Recipe with id ${id} doesn't exist` });
      return;
    }

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

// PATCH /api/recipes/approve/:id
recipeRouter.patch(
  "/approve/:id",
  approveLimiter,
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response) => {
    const idParam = req.params["id"];
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const action = req.body.action as string | undefined;
    const reviewNotesRaw = req.body.reviewNotes as string | undefined;
    const authUser = getAuthUser(res);

    if (!id) {
      res.status(400).json({ error: "Missing recipe id" });
      return;
    }

    if (action !== "approve" && action !== "reject") {
      res.status(400).json({
        error: "Invalid action. Must be 'approve' or 'reject'.",
      });
      return;
    }

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      res.status(404).json({ error: `Recipe with id ${id} doesn't exist` });
      return;
    }

    if (recipe.status !== "PENDING") {
      res.status(409).json({
        error: `Recipe is already ${recipe.status.toLowerCase()} and cannot be reviewed again.`,
      });
      return;
    }

    if (action === "approve") {
      const approvedBy =
        authUser?.username || authUser?.email || "internal-admin";

      const approvedRecipe = await prisma.recipe.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy,
          reviewNotes: null,
        },
        include: {
          submittedByUser: {
            select: { username: true },
          },
        },
      });

      const { imageUrl } = buildImageUrls(approvedRecipe);

      void DiscordService.sendRecipeNotification({
        title: approvedRecipe.title,
        recipeUrl: buildPublicRecipeUrl(approvedRecipe.shortTitle),
        submittedBy: resolveSubmittedBy(approvedRecipe),
        time: approvedRecipe.time,
        imageUrl,
      });

      res.json({ message: "Recipe approved", id });
      return;
    }

    const reviewNotes = reviewNotesRaw?.trim() || null;
    await prisma.recipe.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewNotes,
        approvedAt: null,
        approvedBy: null,
      },
    });

    res.json({ message: "Recipe rejected", id });
  },
);

// GET /api/recipes/mine
recipeRouter.get("/mine", requireAuth, async (_req: Request, res: Response) => {
  const authUser = getAuthUser(res);

  const recipes = await prisma.recipe.findMany({
    where: {
      submittedByUserId: authUser!.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      submittedByUser: {
        select: { username: true },
      },
    },
  });

  res.json(recipes.map(toPublicRecipe));
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

  const recipe = await prisma.recipe.findUnique({
    where: { shortTitle },
    include: {
      submittedByUser: {
        select: { username: true },
      },
    },
  });
  if (!recipe || recipe.status !== "APPROVED") {
    res
      .status(404)
      .json({ error: `Recipe with shortTitle ${shortTitle} doesn't exist` });
    return;
  }

  res.json(toPublicRecipe(recipe));
});
