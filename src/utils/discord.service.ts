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
      embeds: [
        {
          title: recipe.title,
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
              value: `${recipe.time} Minuten` || "n/a",
              inline: true,
            },
          ],
          image: recipe.imageUrl ? { url: recipe.imageUrl } : undefined,
          footer: { text: "FoodieFlip API" },
        },
      ],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Discord webhook failed (${response.status}): ${body || response.statusText}`,
        );
      }
    } catch (error) {
      console.error("Failed to send Discord notification:", error);
    }
  }
}
