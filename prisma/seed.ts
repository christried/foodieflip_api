import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaNeon({
  connectionString: process.env["DATABASE_URL"]!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data/recipes.json"),
    "utf-8",
  );
  const recipes = JSON.parse(raw);

  for (const r of recipes) {
    await prisma.recipe.upsert({
      where: { shortTitle: r.shortTitle },
      update: {},
      create: {
        title: r.title,
        shortTitle: r.shortTitle,
        time: r.time,
        imagePath: r.imagePath,
        imageAlt: r.imageAlt,
        ingredients: r.ingredients,
        instructions: r.instructions,
        tagsPublic: r.tags_public,
        tagsInternal: r.tags_internal,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        submittedBy: r.submittedBy,
      },
    });
  }

  console.log("Seeded recipes successfully.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
