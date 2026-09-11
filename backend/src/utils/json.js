export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error('Model returned invalid JSON');
    }

    return JSON.parse(match[0]);
  }
}
