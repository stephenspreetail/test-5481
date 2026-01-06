import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import ChatPage from "../pages/chat";
import { rootRoute } from "./root";

export const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatPage,
  validateSearch: z.object({
    id: z.number().optional(),
  }),
});
