import { RecipeDiscordNotification } from "../models/recipe-discord-notification.model";

export class DiscordService {
  private static getWebhookUrl(): string {
    return process.env["DISCORD_WEBHOOK_URL"] || "";
  }

  static async sendRecipeNotification(
    recipe: RecipeDiscordNotification,
  ): Promise<void> {
    const webhookUrl = this.getWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    const message = {
      content: `🥗 **Ein neues Rezept ist online!**`,
      allowed_mentions: { parse: ["users", "roles"] },
      embeds: [
        {
          title: recipe.title,
          url: recipe.recipeUrl,
          color: 5814783,
          timestamp: new Date().toISOString(),
          fields: [
            {
              name: "Eingereicht von:",
              value: recipe.submittedBy || "Anonym",
              inline: true,
            },
            {
              name: "Zubereitungszeit:",
              value: recipe.time != null ? `${recipe.time} Minuten` : "n/a",
              inline: true,
            },
          ],
          image: recipe.imageUrl ? { url: recipe.imageUrl } : undefined,
          footer: { text: "FoodieFlip API" },
        },
      ],
    };

    // create AbortController to avoid "zombie executions" in heroku if discord takes a very long time
    const abortController = new AbortController();
    const { signal } = abortController;

    const abortTimeout = setTimeout(() => abortController.abort(), 60000);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal,
      });

      clearTimeout(abortTimeout);

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Discord webhook failed (${response.status}): ${body || response.statusText}`,
        );
      }
    } catch (error: unknown) {
      if ((error as Error).name === "AbortError") {
        console.error("Fetch aborted: The request took too long to respond.");
      } else console.error("Failed to send Discord notification:", error);
    }
  }
}
