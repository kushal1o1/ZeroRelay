export function isMarkdownFileName(fileName?: string): boolean {
  return /\.(md|markdown)$/i.test(fileName ?? "");
}
