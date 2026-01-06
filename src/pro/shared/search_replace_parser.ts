/**
 * Parser for search/replace blocks in the format:
 * <<<<<<< SEARCH
 * content to find
 * =======
 * content to replace with
 * >>>>>>> REPLACE
 */

export interface SearchReplaceBlock {
  searchContent: string;
  replaceContent: string;
}

/**
 * Parse a string containing one or more search/replace blocks
 * @param content The string containing search/replace blocks
 * @returns Array of parsed blocks with search and replace content
 */
export function parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];

  // Regex to match search/replace blocks
  // Handles both CRLF and LF line endings
  const blockRegex = /<<<<<<< SEARCH\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> REPLACE/g;

  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    blocks.push({
      searchContent: match[1],
      replaceContent: match[2],
    });
  }

  return blocks;
}
