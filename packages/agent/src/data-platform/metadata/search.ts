/**
 * Metadata Search Engine
 *
 * Uses MiniSearch for efficient fuzzy full-text search across
 * tables and columns in the data platform metadata catalog.
 */

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import {
  loadMetadataCatalog,
  getAllTables,
  getTablesByDomain,
  getTablesByTier,
  getDomains,
} from "./loader.js";
import type {
  TableDetails,
  TableSearchResult,
  DomainSummary,
  DataTier,
  ColumnMetadata,
} from "./types.js";

/**
 * Search options for table search
 */
export interface SearchOptions {
  /** Filter by domain */
  domain?: string;
  /** Filter by tier (MART, INT, STG, RAW) */
  tier?: DataTier;
  /** Maximum number of results */
  limit?: number;
  /** Minimum relevance score (0-1) */
  minScore?: number;
  /** Only include tables with sample queries */
  requireSampleQueries?: boolean;
}

/**
 * Document structure for MiniSearch indexing
 */
interface TableDocument {
  id: string;
  name: string;
  description: string;
  domain: string;
  tier: string;
  columnNames: string;
  columnDescriptions: string;
  tags: string;
}

// Cached search index
let tableSearchIndex: MiniSearch<TableDocument> | null = null;
let indexedTableCount = 0;

/**
 * Build or get the MiniSearch index for tables
 */
function getTableSearchIndex(): MiniSearch<TableDocument> {
  const catalog = loadMetadataCatalog();
  const tables = getAllTables();

  // Rebuild index if tables changed
  if (tableSearchIndex && indexedTableCount === tables.length) {
    return tableSearchIndex;
  }

  // Create new index with field boosting
  tableSearchIndex = new MiniSearch<TableDocument>({
    fields: ["name", "description", "domain", "columnNames", "columnDescriptions", "tags"],
    storeFields: ["id", "name", "description", "domain", "tier"],
    searchOptions: {
      boost: {
        name: 3,          // Table name most important
        description: 2,   // Description second
        domain: 1.5,      // Domain helps relevance
        tags: 1.5,        // Tags help relevance
        columnNames: 1,   // Column names useful
        columnDescriptions: 0.5, // Column descriptions lowest weight
      },
      fuzzy: 0.2,         // Allow fuzzy matching
      prefix: true,       // Allow prefix matching
    },
  });

  // Index all tables
  const documents: TableDocument[] = tables.map((table) => ({
    id: table.fullPath,
    name: table.name,
    description: table.description,
    domain: table.domain,
    tier: table.tier,
    columnNames: (table.columns || []).map((c) => c.name).join(" "),
    columnDescriptions: (table.columns || []).map((c) => c.description || "").join(" "),
    tags: (table.tags || []).join(" "),
  }));

  tableSearchIndex.addAll(documents);
  indexedTableCount = tables.length;

  return tableSearchIndex;
}

/**
 * Convert MiniSearch result to TableSearchResult
 */
function toTableSearchResult(
  result: MiniSearchResult,
  table: TableDetails,
  matchedTerms: string[]
): TableSearchResult {
  return {
    fullPath: table.fullPath,
    tableName: table.name,
    schemaName: table.schemaName,
    catalogName: table.catalogName,
    dataSourceId: table.dataSourceId,
    description: table.description,
    tier: table.tier,
    domain: table.domain,
    score: Math.min(result.score / 10, 1), // Normalize score to 0-1
    matchedTerms,
  };
}

/**
 * Search for tables by keywords using MiniSearch
 *
 * @param query - Search query (space-separated keywords)
 * @param options - Search options
 * @returns Sorted array of search results
 */
export function searchTables(
  query: string,
  options: SearchOptions = {}
): TableSearchResult[] {
  const {
    domain,
    tier,
    limit = 10,
    minScore = 0.05,
    requireSampleQueries = false,
  } = options;

  loadMetadataCatalog();
  const allTables = getAllTables();
  const tableMap = new Map(allTables.map((t) => [t.fullPath, t]));

  // Handle empty query - return all tables with filters applied
  if (!query.trim()) {
    let tables = allTables;

    if (domain) {
      tables = tables.filter((t) => t.domain.toLowerCase() === domain.toLowerCase());
    }
    if (tier) {
      tables = tables.filter((t) => t.tier.toUpperCase() === tier.toUpperCase());
    }
    if (requireSampleQueries) {
      tables = tables.filter((t) => t.sampleQueries && t.sampleQueries.length > 0);
    }

    // Sort by tier preference (MART first)
    tables.sort((a, b) => {
      const tierOrder = { MART: 0, INT: 1, STG: 2, RAW: 3 };
      return (tierOrder[a.tier] ?? 4) - (tierOrder[b.tier] ?? 4);
    });

    return tables.slice(0, limit).map((table) => ({
      fullPath: table.fullPath,
      tableName: table.name,
      schemaName: table.schemaName,
      catalogName: table.catalogName,
      dataSourceId: table.dataSourceId,
      description: table.description,
      tier: table.tier,
      domain: table.domain,
      score: table.tier === "MART" ? 1.0 : 0.5,
      matchedTerms: [],
    }));
  }

  // Use MiniSearch for query
  const index = getTableSearchIndex();
  const searchResults = index.search(query, {
    // Boost MART tables
    boostDocument: (id) => {
      const table = tableMap.get(id);
      return table?.tier === "MART" ? 1.5 : 1;
    },
  });

  // Convert and filter results
  const results: TableSearchResult[] = [];

  for (const result of searchResults) {
    const table = tableMap.get(result.id);
    if (!table) continue;

    // Apply filters
    if (domain && table.domain.toLowerCase() !== domain.toLowerCase()) continue;
    if (tier && table.tier.toUpperCase() !== tier.toUpperCase()) continue;
    if (requireSampleQueries && (!table.sampleQueries || table.sampleQueries.length === 0)) continue;

    const normalizedScore = Math.min(result.score / 10, 1);
    if (normalizedScore < minScore) continue;

    // Extract matched terms from match info
    const matchedTerms = Object.keys(result.match || {}).map((term) => {
      const fields = result.match[term];
      return `${fields.join(",")}:${term}`;
    });

    results.push(toTableSearchResult(result, table, matchedTerms));

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Search for columns across all tables using MiniSearch
 */
export function searchColumns(
  query: string,
  options: { limit?: number; domain?: string } = {}
): Array<{
  column: ColumnMetadata;
  table: TableDetails;
  score: number;
}> {
  const { limit = 20, domain } = options;

  loadMetadataCatalog();

  const tables = domain ? getTablesByDomain(domain) : getAllTables();

  // Build a mini-search for columns
  const columnIndex = new MiniSearch<{
    id: string;
    name: string;
    description: string;
    tablePath: string;
  }>({
    fields: ["name", "description"],
    storeFields: ["id", "name", "tablePath"],
    searchOptions: {
      boost: { name: 2, description: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Build column lookup and index documents
  const columnLookup = new Map<string, { column: ColumnMetadata; table: TableDetails }>();
  const documents: Array<{
    id: string;
    name: string;
    description: string;
    tablePath: string;
  }> = [];

  for (const table of tables) {
    for (const column of table.columns || []) {
      const id = `${table.fullPath}.${column.name}`;
      columnLookup.set(id, { column, table });
      documents.push({
        id,
        name: column.name,
        description: column.description || "",
        tablePath: table.fullPath,
      });
    }
  }

  columnIndex.addAll(documents);

  // Search
  const searchResults = columnIndex.search(query);

  return searchResults.slice(0, limit).map((result) => {
    const entry = columnLookup.get(result.id)!;
    return {
      column: entry.column,
      table: entry.table,
      score: Math.min(result.score / 5, 1),
    };
  });
}

/**
 * Get domain summaries for discovery
 */
export function getDomainSummaries(): DomainSummary[] {
  loadMetadataCatalog();

  const domains = getDomains();
  const allTables = getAllTables();

  return domains.map((domain) => {
    const domainTables = allTables.filter(
      (t) => t.domain.toLowerCase() === domain.toLowerCase()
    );

    const tiers = [...new Set(domainTables.map((t) => t.tier))];

    // Get example tables (prefer MART tier)
    const exampleTables = domainTables
      .sort((a, b) => {
        if (a.tier === "MART" && b.tier !== "MART") return -1;
        if (a.tier !== "MART" && b.tier === "MART") return 1;
        return 0;
      })
      .slice(0, 3)
      .map((t) => t.fullPath);

    return {
      name: domain,
      tableCount: domainTables.length,
      tiers,
      exampleTables,
    };
  });
}

/**
 * Suggest tables based on a use case description
 *
 * Uses MiniSearch with lower fuzzy threshold for semantic-like matching.
 */
export function suggestTablesForUseCase(
  useCase: string,
  options: { limit?: number } = {}
): TableSearchResult[] {
  const { limit = 5 } = options;

  // Search with the full use case - MiniSearch handles tokenization
  return searchTables(useCase, {
    limit,
    minScore: 0.02, // Lower threshold for broader matching
  });
}

/**
 * Get related tables based on a given table
 */
export function getRelatedTables(
  tablePath: string,
  options: { limit?: number } = {}
): TableDetails[] {
  const { limit = 5 } = options;

  loadMetadataCatalog();

  const allTables = getAllTables();
  const sourceTable = allTables.find((t) => t.fullPath === tablePath);

  if (!sourceTable) {
    return [];
  }

  // Find related tables based on:
  // 1. Explicit relationships
  // 2. Same domain
  // 3. Similar column names

  const relatedPaths = new Set<string>();

  // Add explicit relationships
  for (const rel of sourceTable.relatedTables || []) {
    relatedPaths.add(rel);
  }

  // Find tables in same domain
  const sameDomain = allTables.filter(
    (t) =>
      t.domain === sourceTable.domain &&
      t.fullPath !== tablePath &&
      !relatedPaths.has(t.fullPath)
  );

  // Sort by column name similarity
  const sourceColumns = new Set(
    (sourceTable.columns || []).map((c) => c.name.toLowerCase())
  );

  const scored = sameDomain.map((t) => {
    const tableColumns = new Set(
      (t.columns || []).map((c) => c.name.toLowerCase())
    );
    const overlap = [...sourceColumns].filter((c) => tableColumns.has(c)).length;
    return { table: t, score: overlap };
  });

  scored.sort((a, b) => b.score - a.score);

  // Combine explicit relationships with scored similar tables
  const result: TableDetails[] = [];

  // Add explicit relationships first
  for (const path of relatedPaths) {
    const table = allTables.find((t) => t.fullPath === path);
    if (table) {
      result.push(table);
    }
  }

  // Add similar tables
  for (const { table } of scored) {
    if (result.length >= limit) break;
    if (!result.find((t) => t.fullPath === table.fullPath)) {
      result.push(table);
    }
  }

  return result.slice(0, limit);
}

/**
 * Invalidate the search index (call after metadata reload)
 */
export function invalidateSearchIndex(): void {
  tableSearchIndex = null;
  indexedTableCount = 0;
}
