import type { ProposalResult } from "@/lib/schemas";
import { atom } from "jotai";

export const proposalResultAtom = atom<ProposalResult | null>(null);
