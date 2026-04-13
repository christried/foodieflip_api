import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { uploadToSpaces } from "../utils/spaces";
import sharp from "sharp";
import { prisma } from "../prisma";
import { getAuthUser, requireAuth } from "../middleware/auth";

dotenv.config();

export const submitRouter = Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again later." },
});

// Multer config
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG and WebP images are allowed"));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function isValidCuid(value: string): boolean {
  // Prisma cuid() values are lowercase and start with "c".
  return /^c[a-z0-9]{24}$/.test(value);
}

async function createImageVariants(file: Express.Multer.File): Promise<{
  extension: string;
  original: Buffer;
  medium300: Buffer;
  small100: Buffer;
}> {
  const extension = getExtensionFromMimeType(file.mimetype);

  const medium300 = await sharp(file.buffer)
    .resize({ width: 300, withoutEnlargement: true })
    .toBuffer();

  const small100 = await sharp(file.buffer)
    .resize({ width: 100, withoutEnlargement: true })
    .toBuffer();

  return {
    extension,
    original: file.buffer,
    medium300,
    small100,
  };
}

// Trello helper functions

const TRELLO_MEMBER_IDS = ["59c913636590c4a9c543c20c"]; // Chris' Member-ID

async function createTrelloCard(
  idList: string,
  name: string,
  desc: string,
): Promise<{ id: string; url: string }> {
  const key = process.env["TRELLO_API_KEY"] as string;
  const token = process.env["TRELLO_API_TOKEN"] as string;

  const response = await fetch(
    `https://api.trello.com/1/cards?idList=${idList}&key=${key}&token=${token}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}&pos=top&idMembers=${TRELLO_MEMBER_IDS}`,
    { method: "POST", headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error(`Trello card creation failed: ${response.statusText}`);
  }

  return response.json() as Promise<{ id: string; url: string }>;
}

function slugifyShortTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function generateUniqueShortTitle(title: string): Promise<string> {
  const base = slugifyShortTitle(title) || "recipe";
  let counter = 1;

  while (true) {
    const candidate = counter === 1 ? base : `${base}-${counter}`;
    const existing = await prisma.recipe.findUnique({
      where: { shortTitle: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    counter += 1;
  }
}

function getAdminPanelBaseUrl(): string {
  const isProduction = process.env["NODE_ENV"] === "production";
  if (isProduction) {
    return (process.env["ADMIN_PANEL_URL_PROD"] || "").replace(/\/$/, "");
  }
  return (process.env["ADMIN_PANEL_URL_DEV"] || "").replace(/\/$/, "");
}

//PUT /api/submit/image

submitRouter.put(
  "/image",
  submitLimiter,
  requireAuth,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const recipeId = (req.body as { recipeId?: string }).recipeId ?? "";

    if (!isValidCuid(recipeId)) {
      res.status(400).json({
        message: "Missing or invalid recipeId (must be a valid CUID)",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No image file received" });
      return;
    }

    const idList = process.env["TRELLO_NEW_IMAGES_LIST_ID"] as string;
    const cardName = `New Image for Recipe ${recipeId}`;

    try {
      const safeFileBaseName = stripExtension(
        sanitizeFilename(req.file.originalname),
      );
      const timestamp = Date.now();
      const variantRoot = `submissions/images/${recipeId}/${timestamp}-${safeFileBaseName}`;

      const variants = await createImageVariants(req.file);
      const originalKey = `${variantRoot}/original.${variants.extension}`;
      const mediumKey = `${variantRoot}/medium-300w.${variants.extension}`;
      const smallKey = `${variantRoot}/small-100w.${variants.extension}`;

      const [originalUrl, mediumUrl, smallUrl] = await Promise.all([
        uploadToSpaces(req.file.buffer, originalKey, req.file.mimetype),
        uploadToSpaces(variants.medium300, mediumKey, req.file.mimetype),
        uploadToSpaces(variants.small100, smallKey, req.file.mimetype),
      ]);

      const cardDesc = `Original filename: ${req.file.originalname}\nMIME type: ${req.file.mimetype}\nSize: ${req.file.size} bytes\nOriginal URL: ${originalUrl}\nMedium URL (300w): ${mediumUrl}\nSmall URL (100w): ${smallUrl}\n\nReview image in Neon/admin workflow.`;
      const newCard = await createTrelloCard(idList, cardName, cardDesc);

      console.log("Image submission card created:", newCard.url);
      res.status(200).json({ message: "Image submitted for review" });
    } catch (error) {
      console.error("Failed to submit image:", error);
      res.status(502).json({
        message: "Could not submit image for review. Please try again later.",
      });
    }
  },
);

// POST /api/submit/recipe

submitRouter.post(
  "/recipe",
  submitLimiter,
  requireAuth,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const authUser = getAuthUser(res);
    if (!authUser) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!authUser.username) {
      res.status(409).json({
        message: "Please set a username before submitting recipes.",
      });
      return;
    }

    const body = req.body as Record<string, string>;

    const title = body["title"]?.trim() ?? "";
    const submittedBy = authUser.username;
    const timeString = body["time"] ?? "";

    if (!title) {
      res.status(400).json({ message: "Missing or empty title" });
      return;
    }

    const time = +timeString;
    if (!Number.isInteger(time) || time <= 0) {
      res.status(400).json({ message: "time must be a positive integer" });
      return;
    }

    let ingredients: string[];
    let instructions: string[];

    try {
      ingredients = JSON.parse(body["ingredients"] ?? "");
      if (!Array.isArray(ingredients)) throw new Error();
    } catch {
      res
        .status(400)
        .json({ message: "ingredients must be a valid JSON array" });
      return;
    }

    try {
      instructions = JSON.parse(body["instructions"] ?? "");
      if (!Array.isArray(instructions)) throw new Error();
    } catch {
      res
        .status(400)
        .json({ message: "instructions must be a valid JSON array" });
      return;
    }

    try {
      let originalUrl: string | undefined;
      let mediumUrl: string | undefined;
      let smallUrl: string | undefined;
      let imageExtension = "jpg";

      if (req.file) {
        const safeFileBaseName = stripExtension(
          sanitizeFilename(req.file.originalname),
        );
        const timestamp = Date.now();
        const variantRoot = `submissions/recipes/${timestamp}-${safeFileBaseName}`;

        const variants = await createImageVariants(req.file);
        imageExtension = variants.extension;
        const originalKey = `${variantRoot}/original.${variants.extension}`;
        const mediumKey = `${variantRoot}/medium-300w.${variants.extension}`;
        const smallKey = `${variantRoot}/small-100w.${variants.extension}`;

        [originalUrl, mediumUrl, smallUrl] = await Promise.all([
          uploadToSpaces(req.file.buffer, originalKey, req.file.mimetype),
          uploadToSpaces(variants.medium300, mediumKey, req.file.mimetype),
          uploadToSpaces(variants.small100, smallKey, req.file.mimetype),
        ]);
      }

      const shortTitle = await generateUniqueShortTitle(title);
      const createdRecipe = await prisma.recipe.create({
        data: {
          title,
          shortTitle,
          time,
          imageExtension,
          imageAlt: title,
          ingredients,
          instructions,
          tagsPublic: [],
          tagsInternal: [],
          submittedBy,
          submittedByUserId: authUser.id,
          status: "PENDING",
        },
      });

      const adminPanelBaseUrl = getAdminPanelBaseUrl();
      const idList = process.env["TRELLO_NEW_RECIPES_LIST_ID"] as string;
      const cardName = `New Recipe: ${title}`;

      const recipeJson = JSON.stringify(
        {
          id: createdRecipe.id,
          title,
          shortTitle,
          time,
          imageExtension,
          imageAlt: title,
          ingredients,
          instructions,
          tags_public: [],
          tags_internal: [],
          upvotes: 0,
          downvotes: 0,
          submittedBy,
          status: "PENDING",
        },
        null,
        2,
      );

      const cardDesc =
        req.file && originalUrl && mediumUrl && smallUrl
          ? `Recipe ID: ${createdRecipe.id}\nStatus: PENDING\n\n\nOriginal URL: ${originalUrl}\n\n\n\`\`\`json\n${recipeJson}\n\`\`\``
          : `Recipe ID: ${createdRecipe.id}\nStatus: PENDING\n\n\`\`\`json\n${recipeJson}\n\`\`\``;

      const newCard = await createTrelloCard(idList, cardName, cardDesc);

      console.log("Recipe submission card created:", newCard.url);
      res.status(200).json({
        message: "Recipe submitted for review",
        id: createdRecipe.id,
        status: createdRecipe.status,
      });
    } catch (error) {
      console.error("Failed to submit recipe:", error);
      res.status(502).json({
        message: "Could not submit recipe for review. Please try again later.",
      });
    }
  },
);
