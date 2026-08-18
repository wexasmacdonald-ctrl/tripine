const STOP_WORDS = new Set([
  "a", "about", "alex", "all", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
  "can", "check", "could", "did", "do", "does", "email", "files", "find", "for", "forwarded", "from",
  "get", "has", "have", "he", "her", "him", "his", "how", "i", "if", "in", "is", "it", "latest", "me",
  "message", "microsoft", "of", "on", "or", "our", "outlook", "please", "question", "re", "reply",
  "compare", "compared", "happened", "real", "said", "say", "search", "sent", "she", "should", "state", "tell", "that", "the", "their", "them", "there", "they", "this",
  "to", "us", "was", "we", "were", "what", "when", "whether", "which", "who", "will", "with", "would",
  "you", "your", "now", "verified", "amount",
]);

function tokens(value: string) {
  const plain = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ")
    .replace(/[^\p{L}\p{N}._-]+/gu, " ");
  return (plain.match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? [])
    .map((token) => token.replace(/^[._-]+|[._-]+$/g, ""))
    .filter((token) => token.length > 1 && token.length <= 64 && !STOP_WORDS.has(token.toLowerCase()));
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function bodyFileTerms(values: string[]) {
  const documentMarker = values.findIndex((value) => /^(quote|proposal|pricing|contract|invoice|estimate|scope|order)$/i.test(value));
  if (documentMarker < 0) return values.slice(0, 3);
  const next = values[documentMarker + 1];
  const includeQualifier = Boolean(next && /^(change|changes|update|updated|revised|revision|v\d+)$/i.test(next));
  return values.slice(0, Math.min(documentMarker + 1 + (includeQualifier ? 1 : 0), 4));
}

export function buildMicrosoftSearchQueries(subject: string | undefined, content: string) {
  const subjectTerms = unique(tokens(subject ?? ""));
  const bodyTerms = unique(tokens(content));
  const candidates = unique([...subjectTerms, ...bodyTerms]);
  const fileTerms = bodyFileTerms(subjectTerms.length >= 2 ? subjectTerms : candidates);
  const emailTerms = candidates.slice(0, 6);
  const fallback = "recent business";
  return {
    fileQuery: fileTerms.join(" ") || emailTerms.join(" ") || fallback,
    emailQuery: emailTerms.join(" ") || fileTerms.join(" ") || fallback,
  };
}

export function buildMicrosoftMailSearchQueries(emailQuery: string, fileQuery: string) {
  const fileTerms = unique(tokens(fileQuery));
  return unique([
    emailQuery,
    fileQuery,
    fileTerms[0] ?? "",
  ]).filter(Boolean).slice(0, 3);
}

export function fileNameMatchesQuery(name: string, query: string) {
  const normalizedName = name.toLowerCase();
  const terms = unique(tokens(query).map((term) => term.toLowerCase()));
  if (!terms.length) return false;
  const matches = terms.filter((term) => normalizedName.includes(term)).length;
  return matches >= Math.min(2, terms.length) && matches >= Math.ceil(terms.length / 2);
}
