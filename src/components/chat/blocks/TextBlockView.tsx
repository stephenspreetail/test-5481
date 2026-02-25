import { KovaMarkdownParser } from "../KovaMarkdownParser";

interface TextBlockViewProps {
  text: string;
}

export function TextBlockView({ text }: TextBlockViewProps) {
  if (!text.trim()) return null;
  return <KovaMarkdownParser content={text} />;
}
