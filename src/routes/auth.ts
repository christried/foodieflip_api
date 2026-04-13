import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../prisma";

export const authRouter = Router();

const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,24}$/;

const authGoogleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const oauthClient = new OAuth2Client(process.env["GOOGLE_CLIENT_ID"]);

function toUserDto(user: {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

function parseUsername(rawUsername: unknown): string | null {
  if (typeof rawUsername !== "string") {
    return null;
  }

  const normalized = rawUsername.trim();
  if (!USERNAME_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

// POST /api/auth/google
authRouter.post(
  "/google",
  authGoogleLimiter,
  async (req: Request, res: Response) => {
    const credential = (req.body as { credential?: string }).credential?.trim();

    if (!credential) {
      res.status(400).json({ error: "Missing Google credential." });
      return;
    }

    try {
      const googleClientId = process.env["GOOGLE_CLIENT_ID"] as string;
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        res.status(401).json({ error: "Invalid Google token payload." });
        return;
      }

      if (!payload.sub || !payload.email || payload.email_verified !== true) {
        res
          .status(401)
          .json({ error: "Google account must have a verified email." });
        return;
      }

      if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
        res.status(401).json({ error: "Invalid Google token issuer." });
        return;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp <= nowSeconds) {
        res.status(401).json({ error: "Google token has expired." });
        return;
      }

      const normalizedEmail = payload.email.toLowerCase();

      const user = await prisma.user.upsert({
        where: { googleSub: payload.sub },
        update: {
          email: normalizedEmail,
          lastLoginAt: new Date(),
        },
        create: {
          googleSub: payload.sub,
          email: normalizedEmail,
          lastLoginAt: new Date(),
        } as unknown as Prisma.UserCreateInput,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
        },
      });

      req.session.userId = user.id;
      req.session.role = user.role;

      res.status(200).json({
        user: toUserDto(user),
        needsUsername: !user.username,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res
          .status(409)
          .json({ error: "This email is already linked to another user." });
        return;
      }

      console.error("Google authentication failed:", error);
      res.status(401).json({ error: "Google authentication failed." });
    }
  },
);

// GET /api/auth/me
authRouter.get("/me", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Session is invalid or expired." });
      return;
    }

    req.session.role = user.role;

    res.status(200).json({
      user: toUserDto(user),
      needsUsername: !user.username,
    });
  } catch (error) {
    console.error("Failed to fetch current user:", error);
    res.status(500).json({ error: "Could not fetch current user." });
  }
});

// PATCH /api/auth/username
authRouter.patch("/username", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const username = parseUsername((req.body as { username?: string }).username);
  if (!username) {
    res.status(400).json({
      error:
        "Invalid username. Use 3-24 letters (upper/lowercase), numbers, or underscores.",
    });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { username },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    req.session.role = updatedUser.role;

    res.status(200).json({
      user: toUserDto(updatedUser),
      needsUsername: !updatedUser.username,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ error: "Username is already taken." });
      return;
    }

    console.error("Failed to update username:", error);
    res.status(500).json({ error: "Could not update username." });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (req: Request, res: Response) => {
  const cookieName = process.env["COOKIE_NAME"] || "ff_session";
  const isProduction = process.env["NODE_ENV"] === "production";

  const clearSessionCookie = () => {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });
  };

  req.session.destroy((error) => {
    if (error) {
      console.error("Failed to destroy session:", error);
      res.status(500).json({ error: "Failed to logout." });
      return;
    }

    clearSessionCookie();
    res.status(200).json({ message: "Logged out." });
  });
});
