import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

export const feedbackRouter = Router();

dotenv.config();

// Strict rate limiter for feedback — 5 submissions per 15 minutes per IP
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many feedback submissions, please try again later." },
});

// POST /api/feedback/
feedbackRouter.post(
  "/",
  feedbackLimiter,
  async (req: Request, res: Response) => {
    const rawName = req.body.name;
    const rawFeedback = req.body.feedback;

    // Validate presence and type
    if (!rawName || !rawFeedback) {
      res.status(400).json({ error: "Name and feedback are required." });
      return;
    }
    if (typeof rawName !== "string" || typeof rawFeedback !== "string") {
      res.status(400).json({ error: "Name and feedback must be strings." });
      return;
    }

    // Enforce max lengths
    if (rawName.length > 100) {
      res.status(400).json({ error: "Name must be 100 characters or fewer." });
      return;
    }
    if (rawFeedback.length > 1000) {
      res
        .status(400)
        .json({ error: "Feedback must be 1000 characters or fewer." });
      return;
    }

    const name = `Feedback from: ${rawName}`;
    const feedback = rawFeedback;

    const idList = process.env.TRELLO_FEEDBACK_LIST_ID as string;
    const key = process.env.TRELLO_API_KEY as string;
    const token = process.env.TRELLO_API_TOKEN as string;
    const idMembers = ["59c913636590c4a9c543c20c"]; // Chris' Member-ID

    const url = `https://api.trello.com/1/cards?idList=${idList}&key=${key}&token=${token}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(feedback)}&pos=top&idMembers=${idMembers}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      // response.ok is true for status codes 200-299
      if (!response.ok) {
        throw new Error(`Trello API Error: ${response.statusText}`);
      }

      const newCard = (await response.json()) as { url: string };
      console.log("Card created successfully. View it here:", newCard.url);

      res.status(200).json("Feedback has been forwarded successfully");
    } catch (error) {
      console.error("Failed to forward Feedback to developer:", error);
    }
  },
);
