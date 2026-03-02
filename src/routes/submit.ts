import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

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
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

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

async function attachImageToTrelloCard(
  cardId: string,
  file: Express.Multer.File,
): Promise<void> {
  const key = process.env["TRELLO_API_KEY"] as string;
  const token = process.env["TRELLO_API_TOKEN"] as string;

  const attachFormData = new FormData();
  attachFormData.append(
    "file",
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.originalname,
  );
  attachFormData.append("name", file.originalname);
  attachFormData.append("mimeType", file.mimetype);
  attachFormData.append("setCover", "true");

  const response = await fetch(
    `https://api.trello.com/1/cards/${cardId}/attachments?key=${key}&token=${token}`,
    { method: "POST", body: attachFormData },
  );

  if (!response.ok) {
    throw new Error(`Trello attachment upload failed: ${response.statusText}`);
  }
}

//PUT /api/submit/image

submitRouter.put(
  "/image",
  submitLimiter,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const recipeId = (req.body as { recipeId?: string }).recipeId ?? "";

    if (!/^\d+$/.test(recipeId)) {
      res.status(400).json({ message: "Missing or invalid recipeId" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No image file received" });
      return;
    }

    const idList = process.env["TRELLO_NEW_IMAGES_LIST_ID"] as string;
    const cardName = `New Image for Recipe #${recipeId}`;
    const cardDesc = `Original filename: ${req.file.originalname}\nMIME type: ${req.file.mimetype}\nSize: ${req.file.size} bytes`;

    try {
      const newCard = await createTrelloCard(idList, cardName, cardDesc);
      await attachImageToTrelloCard(newCard.id, req.file);

      console.log("Image submission card created:", newCard.url);
      res.status(200).json({ message: "Image submitted for review" });
    } catch (error) {
      console.error("Failed to submit image to Trello:", error);
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
  upload.single("image"),
  async (req: Request, res: Response) => {
    const body = req.body as Record<string, string>;

    const title = body["title"]?.trim() ?? "";
    const submittedBy = body["submittedBy"]?.trim() ?? "";
    const timeString = body["time"] ?? "";

    if (!title) {
      res.status(400).json({ message: "Missing or empty title" });
      return;
    }

    if (!submittedBy) {
      res.status(400).json({ message: "Missing or empty submittedBy" });
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

    const idList = process.env["TRELLO_NEW_RECIPES_LIST_ID"] as string;
    const cardName = `New Recipe: ${title}`;

    const recipeJson = JSON.stringify(
      {
        id: "TBD",
        title,
        time,
        imagePath: req.file ? req.file.originalname : "TBD",
        imageAlt: "TBD",
        ingredients,
        instructions,
        tags_public: [],
        tags_internal: [],
        upvotes: 0,
        downvotes: 0,
        submittedBy,
      },
      null,
      2,
    );

    const cardDesc = req.file
      ? `Image: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)\n\n\`\`\`json\n${recipeJson}\n\`\`\``
      : `\`\`\`json\n${recipeJson}\n\`\`\``;

    try {
      const newCard = await createTrelloCard(idList, cardName, cardDesc);

      if (req.file) {
        await attachImageToTrelloCard(newCard.id, req.file);
      }

      console.log("Recipe submission card created:", newCard.url);
      res.status(200).json({ message: "Recipe submitted for review" });
    } catch (error) {
      console.error("Failed to submit recipe to Trello:", error);
      res.status(502).json({
        message: "Could not submit recipe for review. Please try again later.",
      });
    }
  },
);
