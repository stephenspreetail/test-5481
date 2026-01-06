import { providerSettingsRoute } from "@/routes/settings/providers/$provider";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  GiftIcon,
  Settings,
  Sparkles,
} from "lucide-react";

import SetupProviderCard from "@/components/SetupProviderCard";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { cn } from "@/lib/utils";
import { usePostHog } from "posthog-js/react";
import { useMemo } from "react";

export function SetupBanner() {
  const posthog = usePostHog();
  const navigate = useNavigate();
  const { isAnyProviderSetup, isLoading: loading } =
    useLanguageModelProviders();

  const settingsScrollAndNavigateTo = useScrollAndNavigateTo("/settings", {
    behavior: "smooth",
    block: "start",
  });

  const handleGoogleSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:google:click");
    navigate({
      to: providerSettingsRoute.id,
      params: { provider: "google" },
    });
  };

  const handleOpenRouterSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
    navigate({
      to: providerSettingsRoute.id,
      params: { provider: "openrouter" },
    });
  };

  const handleOtherProvidersClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:other:click");
    settingsScrollAndNavigateTo("provider-settings");
  };

  // Time-based greeting for the title
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) {
      return "Good morning!";
    } else if (hour >= 12 && hour < 17) {
      return "Good afternoon!";
    } else if (hour >= 17 && hour < 21) {
      return "Good evening!";
    } else {
      return "Good evening!";
    }
  }, []);

  // If provider is already setup, just show greeting
  if (isAnyProviderSetup() && !loading) {
    return (
      <h1 className="text-center text-4xl font-semibold mb-8 text-foreground tracking-tight">
        {greeting}
      </h1>
    );
  }

  // Show setup banner if no provider configured
  if (loading) {
    return null;
  }

  const bannerClasses = cn(
    "w-full mb-6 border rounded-xl shadow-sm overflow-hidden",
    "border-zinc-200 dark:border-zinc-700",
  );

  const getStatusIcon = (isComplete: boolean) => {
    return isComplete ? (
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-500" />
    ) : (
      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
    );
  };

  return (
    <>
      <p className="text-xl font-medium text-zinc-700 dark:text-zinc-300 p-4">
        Setup Kova
      </p>
      <div className={bannerClasses}>
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={["ai-setup"]}
        >
          <AccordionItem
            value="ai-setup"
            className={cn(
              isAnyProviderSetup()
                ? "bg-green-50 dark:bg-green-900/30"
                : "bg-yellow-50 dark:bg-yellow-900/30",
            )}
          >
            <AccordionTrigger
              className={cn(
                "px-4 py-3 transition-colors w-full hover:no-underline",
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {getStatusIcon(isAnyProviderSetup())}
                  <span className="font-medium text-sm">
                    Setup AI Access
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 bg-white dark:bg-zinc-900 border-t border-inherit">
              <p className="text-[15px] mb-3">
                Configure an AI provider to start building apps.
              </p>
              <div className="flex gap-2">
                <SetupProviderCard
                  className="flex-1"
                  variant="google"
                  onClick={handleGoogleSetupClick}
                  tabIndex={0}
                  leadingIcon={
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  }
                  title="Setup Google Gemini API Key"
                  chip={<>Free</>}
                />

                <SetupProviderCard
                  className="flex-1"
                  variant="openrouter"
                  onClick={handleOpenRouterSetupClick}
                  tabIndex={0}
                  leadingIcon={
                    <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  }
                  title="Setup OpenRouter API Key"
                  chip={<>Free</>}
                />
              </div>

              <div
                className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                onClick={handleOtherProvidersClick}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-100 dark:bg-gray-700 p-1.5 rounded-full">
                      <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-[15px] text-gray-800 dark:text-gray-300">
                        Setup other AI providers
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        OpenAI, Anthropic and more
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}

export const OpenRouterSetupBanner = ({
  className,
}: {
  className?: string;
}) => {
  const posthog = usePostHog();
  const navigate = useNavigate();
  return (
    <SetupProviderCard
      className={cn("mt-2", className)}
      variant="openrouter"
      onClick={() => {
        posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
        navigate({
          to: providerSettingsRoute.id,
          params: { provider: "openrouter" },
        });
      }}
      tabIndex={0}
      leadingIcon={
        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
      }
      title="Setup OpenRouter API Key"
      chip={
        <>
          <GiftIcon className="w-3 h-3" />
          Free models available
        </>
      }
    />
  );
};
