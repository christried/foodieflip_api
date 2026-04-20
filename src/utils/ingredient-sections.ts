export interface IngredientSectionDto {
  title: string;
  items: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIngredientSections(
  sections: IngredientSectionDto[],
): IngredientSectionDto[] {
  return sections
    .map((section) => ({
      title: section.title.trim(),
      items: section.items
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    }))
    .filter((section) => section.title.length > 0 && section.items.length > 0);
}

function hasStrictIngredientSectionShape(
  value: unknown,
): value is IngredientSectionDto {
  if (!isPlainObject(value)) {
    return false;
  }

  if (typeof value["title"] !== "string") {
    return false;
  }

  if (!Array.isArray(value["items"])) {
    return false;
  }

  return value["items"].every((item) => typeof item === "string");
}

export function parseIngredientSections(
  raw: string | undefined,
): IngredientSectionDto[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  if (!parsed.every(hasStrictIngredientSectionShape)) {
    return null;
  }

  return normalizeIngredientSections(parsed as IngredientSectionDto[]);
}

export function normalizeIngredientSectionsFromUnknown(
  value: unknown,
): IngredientSectionDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sections = value.filter(isPlainObject).map((section) => {
    const title = typeof section["title"] === "string" ? section["title"] : "";
    const rawItems = section["items"];
    const items = Array.isArray(rawItems)
      ? rawItems.filter((item): item is string => typeof item === "string")
      : [];

    return { title, items };
  });

  return normalizeIngredientSections(sections);
}
