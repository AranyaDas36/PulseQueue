import { GoogleGenAI } from "@google/genai";
import { logger } from "../utils/logger.js";

export interface AIEnrichmentResult {
  summary: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tags: string[];
}

export class AIService {
  private static aiClient: GoogleGenAI | null = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  static async enrichTicket(title: string, description: string): Promise<AIEnrichmentResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (this.aiClient && apiKey) {
      try {
        logger.info({ title }, "Calling Gemini API for ticket enrichment");
        const prompt = `Analyze this support ticket title and description:
Title: "${title}"
Description: "${description}"

Return a JSON object with:
1. "summary": A concise 1-2 sentence summary of the issue.
2. "priority": One of "LOW", "MEDIUM", "HIGH", "CRITICAL" based on urgency and impact.
3. "tags": An array of 2-4 lowercase relevant keyword tags (e.g. ["payment", "login", "bug"]).

Return ONLY valid raw JSON with no markdown formatting.`;

        const response = await this.aiClient.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });

        const rawText = response.text || "";
        const cleanJsonStr = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJsonStr);

        return {
          summary: parsed.summary || `${title}: ${description.slice(0, 100)}...`,
          priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.priority)
            ? parsed.priority
            : "MEDIUM",
          tags: Array.isArray(parsed.tags) ? parsed.tags : ["support", "general"],
        };
      } catch (err) {
        logger.error({ err }, "Gemini API call failed, falling back to heuristic enrichment");
      }
    }

    // Heuristic / Mock enrichment fallback if no API key or API call failed
    logger.info("Using smart fallback enrichment for support ticket");
    const lowerText = `${title} ${description}`.toLowerCase();
    
    let priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM";
    if (lowerText.includes("urgent") || lowerText.includes("down") || lowerText.includes("outage") || lowerText.includes("critical")) {
      priority = "CRITICAL";
    } else if (lowerText.includes("error") || lowerText.includes("fail") || lowerText.includes("bug")) {
      priority = "HIGH";
    } else if (lowerText.includes("question") || lowerText.includes("info")) {
      priority = "LOW";
    }

    const tags: string[] = [];
    if (lowerText.includes("payment") || lowerText.includes("order") || lowerText.includes("billing")) tags.push("billing", "payments");
    if (lowerText.includes("login") || lowerText.includes("password") || lowerText.includes("auth")) tags.push("auth", "account");
    if (tags.length === 0) tags.push("support", "inquiry");

    return {
      summary: `Ticket regarding "${title}": ${description.slice(0, 120)}${description.length > 120 ? "..." : ""}`,
      priority,
      tags,
    };
  }
}
