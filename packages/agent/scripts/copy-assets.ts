import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

interface CopyTask {
  src: string;
  dest: string;
}

const copies: CopyTask[] = [
  {
    src: "src/data-platform/metadata/dbt",
    dest: "dist/data-platform/metadata/dbt",
  },
  { src: "src/skills", dest: "dist/skills" },
];

for (const { src, dest } of copies) {
  const srcPath = join(root, src);
  const destPath = join(root, dest);

  if (existsSync(srcPath)) {
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(srcPath, destPath, { recursive: true });
    console.log(`Copied ${src} -> ${dest}`);
  }
}
