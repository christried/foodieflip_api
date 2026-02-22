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

// PUT /api/submit/image
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

    const key = process.env["TRELLO_API_KEY"] as string;
    const token = process.env["TRELLO_API_TOKEN"] as string;
    const idList = process.env["TRELLO_NEW_IMAGES_LIST_ID"] as string;
    const idMembers = ["59c913636590c4a9c543c20c"]; // Chris' Member-ID

    const cardName = encodeURIComponent(`New Image for Recipe #${recipeId}`);
    const cardDesc = encodeURIComponent(
      `Original filename: ${req.file.originalname}\nMIME type: ${req.file.mimetype}\nSize: ${req.file.size} `,
    );

    try {
      // Create the Trello card
      const cardResponse = await fetch(
        `https://api.trello.com/1/cards?idList=${idList}&key=${key}&token=${token}&name=${cardName}&desc=${cardDesc}&pos=top&idMembers=${idMembers}`,
        { method: "POST", headers: { Accept: "application/json" } },
      );

      if (!cardResponse.ok) {
        throw new Error(
          `Trello card creation failed: ${cardResponse.statusText}`,
        );
      }

      const newCard = (await cardResponse.json()) as {
        id: string;
        url: string;
      };

      // Attach the image to the card
      const attachFormData = new FormData();
      attachFormData.append(
        "file",
        new Blob([new Uint8Array(req.file.buffer)], {
          type: req.file.mimetype,
        }),
        req.file.originalname,
      );
      attachFormData.append("name", req.file.originalname);
      attachFormData.append("mimeType", req.file.mimetype);
      attachFormData.append("setCover", "true");

      const attachResponse = await fetch(
        `https://api.trello.com/1/cards/${newCard.id}/attachments?key=${key}&token=${token}`,
        { method: "POST", body: attachFormData },
      );

      if (!attachResponse.ok) {
        throw new Error(
          `Trello attachment upload failed: ${attachResponse.statusText}`,
        );
      }

      console.log("Image submission card created:", newCard.url);
      res.status(200).json({
        message: "Image submitted for review",
      });
    } catch (error) {
      console.error("Failed to submit image to Trello:", error);
      res.status(502).json({
        message: "Could not submit image for review. Please try again later.",
      });
    }
  },
);
