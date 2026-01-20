import { getClient } from "@/client/api/client_factory";
import type { ReactNode } from "react";
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
 * Custom paragraph component that renders as a separate bordered block.
 */
const ResponseBlock = ({
  node: _node,
  children,
  ...props
}: {
  node?: any;
  children?: ReactNode;
  [key: string]: any;
}) => (
  <p
    {...props}
    className="my-2 p-3 rounded-md border border-border/40 bg-muted/30"
  >
    {children}
  </p>
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
 * Each paragraph is rendered as a separate bordered block.
 */
export const KovaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        code: CodeHighlight,
        a: customLink,
        p: ResponseBlock,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
