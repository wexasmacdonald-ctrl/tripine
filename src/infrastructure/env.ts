import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  MODEL_PROVIDER: z.enum(["openai", "azure-openai"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default("organizations"),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_GRAPH_CLIENT_STATE: z.string().min(24).optional(),
  INTERNAL_JOB_SECRET: z.string().min(24).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  DEMO_ORGANIZATION_SLUG: z.string().default("demo-company"),
  DEMO_AGENT_EMAIL: z.string().email().optional(),
  DEMO_INTERNAL_EMAILS: z.string().optional(),
  DEMO_ALLOWED_RECIPIENTS: z.string().optional(),
}).superRefine((value, context) => {
  const azureValues = [value.AZURE_OPENAI_API_KEY, value.AZURE_OPENAI_ENDPOINT, value.AZURE_OPENAI_DEPLOYMENT];
  if (value.MODEL_PROVIDER === "azure-openai" && !azureValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      path: ["AZURE_OPENAI_ENDPOINT"],
      message: "AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT must be configured together.",
    });
  }
});
export const env = serverSchema.parse(process.env);
export const isPersistenceConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL &&
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
);

export const isMicrosoftConfigured = Boolean(
  isPersistenceConfigured &&
  env.MICROSOFT_CLIENT_ID &&
  env.MICROSOFT_CLIENT_SECRET,
);
