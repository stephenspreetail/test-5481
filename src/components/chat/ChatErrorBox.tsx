import { getClient } from "@/client/api/client_factory";
import { AI_STREAMING_ERROR_MESSAGE_PREFIX } from "@/shared/texts";
import { ExternalLink as ExternalLinkIcon, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatErrorBox({
  onDismiss,
  error,
}: {
  onDismiss: () => void;
  error: string;
}) {
  // This is a very long list of model fallbacks that clutters the error message.
  //
  // We are matching "Fallbacks=[{" and not just "Fallbacks=" because the fallback
  // model itself can error and we want to include the fallback model error in the error message.
  // Example: https://github.com/kova-sh/kova/issues/1849#issuecomment-3590685911
  const fallbackPrefix = "Fallbacks=[{";
  let displayError = error;
  if (error.includes(fallbackPrefix)) {
    displayError = error.split(fallbackPrefix)[0];
  }

  return (
    <ChatErrorContainer onDismiss={onDismiss}>
      {displayError}
      <div className="mt-2 space-y-2 space-x-2">
        {error.includes(AI_STREAMING_ERROR_MESSAGE_PREFIX) &&
          !error.includes("TypeError: terminated") && (
            <ExternalLink href="https://spreetail-engineering-playbook.tk.dev/docs/help/ai-rate-limit">
              Troubleshooting guide
            </ExternalLink>
          )}
        <ExternalLink href="https://spreetail-engineering-playbook.tk.dev/docs/faq">
          Read docs
        </ExternalLink>
      </div>
    </ChatErrorContainer>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const baseClasses =
    "cursor-pointer inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2";
  const secondaryClasses =
    "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 focus:ring-blue-200";

  return (
    <a
      className={`${baseClasses} ${secondaryClasses}`}
      onClick={() => getClient().openExternalUrl(href)}
    >
      <span>{children}</span>
      <ExternalLinkIcon size={14} />
    </a>
  );
}

function ChatErrorContainer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode | string;
}) {
  return (
    <div className="relative mt-2 bg-red-50 border border-red-200 rounded-md shadow-sm p-2 mx-4">
      <button
        onClick={onDismiss}
        className="absolute top-2.5 left-2 p-1 hover:bg-red-100 rounded"
      >
        <X size={14} className="text-red-500" />
      </button>
      <div className="pl-8 py-1 text-sm">
        <div className="text-red-700 text-wrap">
          {typeof children === "string" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children: linkChildren, ...props }) => (
                  <a
                    {...props}
                    onClick={(e) => {
                      e.preventDefault();
                      if (props.href) {
                        getClient().openExternalUrl(props.href);
                      }
                    }}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    {linkChildren}
                  </a>
                ),
              }}
            >
              {children}
            </ReactMarkdown>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
