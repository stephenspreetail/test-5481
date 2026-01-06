import { useEffect, useState } from "react";

export function useTypingPlaceholder(
  phrases: string[],
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseAfterType = 1500,
  pauseAfterDelete = 0,
) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    const current = phrases[index];
    const speed = deleting ? deletingSpeed : typingSpeed;
    let pauseTimer: NodeJS.Timeout;
    const timer = setTimeout(() => {
      if (!deleting && charIndex < current.length) {
        // Still typing
        setText((prev) => prev + current.charAt(charIndex));
        setCharIndex((prev) => prev + 1);
      } else if (deleting && charIndex > 0) {
        // Still deleting
        setText((prev) => prev.slice(0, -1));
        setCharIndex((prev) => prev - 1);
      } else if (!deleting && charIndex === current.length) {
        // Finished typing - pause then start deleting
        pauseTimer = setTimeout(() => setDeleting(true), pauseAfterType);
      } else if (deleting && charIndex === 0) {
        // Finished deleting - pause then move to next phrase
        pauseTimer = setTimeout(() => {
          setDeleting(false);
          setIndex((prev) => (prev + 1) % phrases.length);
        }, pauseAfterDelete);
      }
    }, speed);

    return () => {
      clearTimeout(timer);
      clearTimeout(pauseTimer);
    };
  }, [
    phrases,
    index,
    deleting,
    charIndex,
    typingSpeed,
    deletingSpeed,
    pauseAfterType,
    pauseAfterDelete,
  ]);

  return text;
}
