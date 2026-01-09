import { atom } from "jotai";

export const isPreviewOpenAtom = atom(false);
export const selectedFileAtom = atom<{
  path: string;
} | null>(null);
export const activeSettingsSectionAtom = atom<string | null>(
  "general-settings",
);
