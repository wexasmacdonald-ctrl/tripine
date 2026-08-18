import "server-only";
import OpenAI from "openai";
import { env } from "@/infrastructure/env";

export type ModelProvider = "azure-openai" | "openai";

export function getModelRuntime(): { client: OpenAI; model: string; provider: ModelProvider } | undefined {
  if (env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_DEPLOYMENT) {
    const baseURL = `${env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, "")}/openai/v1/`;
    return {
      client: new OpenAI({ apiKey: env.AZURE_OPENAI_API_KEY, baseURL }),
      model: env.AZURE_OPENAI_DEPLOYMENT,
      provider: "azure-openai",
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
      model: env.OPENAI_MODEL,
      provider: "openai",
    };
  }

  return undefined;
}

export function isModelConfigured() {
  return Boolean(getModelRuntime());
}

export function configuredModelProvider(): ModelProvider | "none" {
  return getModelRuntime()?.provider ?? "none";
}
