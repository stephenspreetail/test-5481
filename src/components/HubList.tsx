import { ScrollArea } from "@/components/ui/scroll-area";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const HUB_SECTIONS = [
  { id: "how-i-work", label: "How I Work" },
  { id: "official-templates", label: "Official Templates" },
  { id: "community-templates", label: "Community Templates" },
  { id: "backend-services", label: "Backend Services" },
];

export function HubList({ show }: { show: boolean }) {
  const [activeSection, setActiveSection] = useState<string>("how-i-work");
  const scrollAndNavigateTo = useScrollAndNavigateTo("/hub", {
    behavior: "smooth",
    block: "start",
  });

  useEffect(() => {
    if (!show) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            return;
          }
        }
      },
      { rootMargin: "-20% 0px -80% 0px", threshold: 0 }
    );

    for (const section of HUB_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) {
        observer.observe(el);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [show]);

  if (!show) {
    return null;
  }

  return (
    <div className="flex flex-col h-full pt-2">
      <ScrollArea className="flex-grow">
        <div className="space-y-1 px-4 pb-4">
          {HUB_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollAndNavigateTo(section.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                activeSection === section.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "hover:bg-sidebar-accent"
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
