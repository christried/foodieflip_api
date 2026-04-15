import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { getAuthUser, requireAuth } from "../middleware/auth";
import { SUBMITTED_BY_FALLBACK } from "./recipes";
export const favoritesRouter = Router();

interface FavoriteRecipeDto {
  id: string;
  shortTitle: string;
  title: string;
  imageUrl: string;
  imageAlt: string;
  time: number;
  submittedBy: string;
}

function buildImageUrl(id: string, imageExtension: string): string {
  const cdnBase = process.env["SPACES_CDN_BASE_URL"] as string;
  const extension = imageExtension.toLowerCase() || "jpg";
  return `${cdnBase}/images/${id}/medium-300w.${extension}`;
}

function parseRecipeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getFavoriteUser(res: Response) {
  const authUser = getAuthUser(res);
  if (!authUser) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return authUser;
}

function resolveSubmittedBy(username: string | null | undefined): string {
  const normalizedUsername = username?.trim();
  return normalizedUsername || SUBMITTED_BY_FALLBACK;
}

// GET /api/favorites
favoritesRouter.get("/", requireAuth, async (_req: Request, res: Response) => {
  const authUser = getFavoriteUser(res);
  if (!authUser) {
    return;
  }

  try {
    const favorites = await prisma.favoriteRecipe.findMany({
      where: {
        userId: authUser.id,
        recipe: { status: "APPROVED" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        recipe: {
          select: {
            id: true,
            shortTitle: true,
            title: true,
            imageExtension: true,
            imageAlt: true,
            time: true,
            submittedByUser: {
              select: { username: true },
            },
          },
        },
      },
    });

    res.status(200).json(
      favorites.map(
        (favorite): FavoriteRecipeDto => ({
          id: favorite.recipe.id,
          shortTitle: favorite.recipe.shortTitle,
          title: favorite.recipe.title,
          imageUrl: buildImageUrl(
            favorite.recipe.id,
            favorite.recipe.imageExtension,
          ),
          imageAlt: favorite.recipe.imageAlt,
          time: favorite.recipe.time,
          submittedBy: resolveSubmittedBy(
            favorite.recipe.submittedByUser?.username,
          ),
        }),
      ),
    );
  } catch (error) {
    console.error("Failed to fetch favorites:", error);
    res.status(500).json({ error: "Could not fetch favorites." });
  }
});

// POST /api/favorites
favoritesRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  const authUser = getFavoriteUser(res);
  if (!authUser) {
    return;
  }

  const recipeId = parseRecipeId((req.body as { recipeId?: string }).recipeId);
  if (!recipeId) {
    res.status(400).json({ error: "Missing recipeId." });
    return;
  }

  try {
    const recipe = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        status: "APPROVED",
      },
      select: { id: true },
    });

    if (!recipe) {
      res
        .status(404)
        .json({ error: "Recipe not found or not available for favorites." });
      return;
    }

    await prisma.favoriteRecipe.upsert({
      where: {
        userId_recipeId: {
          userId: authUser.id,
          recipeId,
        },
      },
      create: {
        userId: authUser.id,
        recipeId,
      },
      update: {},
    });

    res.status(204).send();
  } catch (error) {
    console.error("Failed to add favorite:", error);
    res.status(500).json({ error: "Could not add favorite." });
  }
});

// DELETE /api/favorites/:recipeId
favoritesRouter.delete(
  "/:recipeId",
  requireAuth,
  async (req: Request, res: Response) => {
    const authUser = getFavoriteUser(res);
    if (!authUser) {
      return;
    }

    const recipeIdParam = req.params["recipeId"];
    const recipeId = parseRecipeId(
      Array.isArray(recipeIdParam) ? recipeIdParam[0] : recipeIdParam,
    );

    if (!recipeId) {
      res.status(400).json({ error: "Missing recipeId." });
      return;
    }

    try {
      await prisma.favoriteRecipe.deleteMany({
        where: {
          userId: authUser.id,
          recipeId,
        },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      res.status(500).json({ error: "Could not remove favorite." });
    }
  },
);
