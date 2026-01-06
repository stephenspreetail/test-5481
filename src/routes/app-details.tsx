import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import AppDetailsPage from "../pages/app-details";
import { rootRoute } from "./root";

export const appDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app-details",
  component: AppDetailsPage,
  validateSearch: z.object({
    appId: z.number().optional(),
  }),
});
