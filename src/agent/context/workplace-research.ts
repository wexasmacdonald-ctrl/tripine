const WORKPLACE_RESEARCH_TERMS = /\b(find|search|check|look up|latest|current|quote|proposal|pricing|contract|document|file|sharepoint|onedrive|outlook|email|forwarded|attachment|repl(?:y|ied|ies)|respond(?:ed|s)?)\b/i;

export function shouldResearchWorkplace(message: string) {
  return WORKPLACE_RESEARCH_TERMS.test(message);
}

export function boundWorkplaceEvidence<T extends {
  query: string;
  emailQuery?: string;
  emails: Array<Record<string, unknown> & { excerpt?: string }>;
  files: Array<Record<string, unknown> & { excerpt?: string }>;
}>(evidence: T) {
  return {
    query: evidence.query,
    emailQuery: evidence.emailQuery,
    emails: evidence.emails.slice(0, 8).map((item) => ({ ...item, excerpt: item.excerpt?.slice(0, 1_500) })),
    files: evidence.files.slice(0, 8).map((item) => ({ ...item, excerpt: item.excerpt?.slice(0, 6_000) })),
  };
}
