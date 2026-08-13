export function findCompanyMentions(companies: Array<{ id: string; name: string }>, text: string) {
  const normalized = text.toLowerCase();
  return companies.filter((company) => {
    const name = company.name.toLowerCase();
    const shorthand = name.split(/\s+/)[0];
    return normalized.includes(name) || (shorthand.length >= 3 && new RegExp(`\\b${shorthand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  });
}
