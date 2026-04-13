import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../prisma";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
}

type AuthLocals = {
  authUser?: AuthUser;
};

export function getAuthUser(res: Response): AuthUser | null {
  return (res.locals as AuthLocals).authUser ?? null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
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
      req.session.userId = undefined;
      req.session.role = undefined;
      req.session.destroy(() => {});
      res.status(401).json({ error: "Session is invalid or expired." });
      return;
    }

    req.session.role = user.role;
    (res.locals as AuthLocals).authUser = user;
    next();
  } catch (error) {
    console.error("Failed to validate authenticated user:", error);
    res.status(500).json({ error: "Unable to validate current session." });
  }
}

export function requireRole(role: UserRole) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const authUser = getAuthUser(res);
    if (!authUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    if (authUser.role !== role) {
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }

    next();
  };
}
