import { getClient } from "@/client/api/client_factory";
import { useEffect, useState } from "react";

export function useAppVersion() {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getClient().getAppVersion();
        setAppVersion(version);
      } catch {
        setAppVersion(null);
      }
    };
    fetchVersion();
  }, []);

  return appVersion;
}
