const required = [
  "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET", "MICROSOFT_GRAPH_CLIENT_STATE", "INTERNAL_JOB_SECRET",
  "CRON_SECRET", "CREDENTIAL_ENCRYPTION_KEY", "DEMO_AGENT_EMAIL", "DEMO_INTERNAL_EMAILS", "DEMO_ALLOWED_RECIPIENTS",
];

const missing = required.filter((name) => !process.env[name]);
const weak = ["MICROSOFT_GRAPH_CLIENT_STATE", "INTERNAL_JOB_SECRET", "CRON_SECRET"].filter((name) => process.env[name] && process.env[name].length < 32);
let encryptionValid = false;
try { encryptionValid = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY ?? "", "base64").length === 32; } catch { encryptionValid = false; }

console.log(JSON.stringify({ ready: missing.length === 0 && weak.length === 0 && encryptionValid, missing, weak, encryptionKeyIs32Bytes: encryptionValid }, null, 2));
if (missing.length || weak.length || !encryptionValid) process.exitCode = 1;
