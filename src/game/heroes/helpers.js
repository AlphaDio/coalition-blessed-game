export function formatMessage(template, values) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] ?? match;
  });
}
