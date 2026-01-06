import { getClient } from "@/client/api/client_factory";
import ReactMarkdown from "react-markdown";
import { CodeHighlight } from "./CodeHighlight";

const customLink = ({
  node: _node,
  ...props
}: {
  node?: any;
  [key: string]: any;
}) => (
  <a
    {...props}
    onClick={(e) => {
      const url = props.href;
      if (url) {
        e.preventDefault();
        getClient().openExternalUrl(url);
      }
    }}
  />
);

/**
 * Simple markdown parser without code highlighting.
 * Used for content that doesn't contain code blocks.
 */
export const VanillaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        a: customLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

/**
 * Markdown parser for chat messages.
 * Renders standard markdown with syntax highlighting for code blocks.
 */
export const KovaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        code: CodeHighlight,
        a: customLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
