export function parseSpamMessage(input) {
  const value = String(input || "").trim();
  const match = value.match(/^([\s\S]+?)\s+(\d+)$/) || value.match(/^\+([\s\S]+)\+\{(\d+)\}$/);
  if (!match) return null;
  const content = match[1].trim(); const count = Number(match[2]);
  if (!content || !Number.isSafeInteger(count) || count < 1) return null;
  return { content, count };
}
