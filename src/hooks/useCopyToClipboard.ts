import { useEffect, useRef, useState } from "react";

export const useCopyToClipboard = () => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copyMessageContent = async (messageContent: string) => {
    try {
      await navigator.clipboard.writeText(messageContent);

      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (error) {
      console.error("Failed to copy content:", error);
      return false;
    }
  };

  return { copyMessageContent, copied };
};
