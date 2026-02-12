/**
 * Metadata Catalog Module
 *
 * Exports types, loaders, and search functions for the
 * Data Platform metadata catalog.
 */

// Export all types
export * from "./types.js";

// Export loader functions
export {
  loadMetadataCatalog,
  getDataSources,
  getDataSource,
  getAllTables,
  getTable,
  getTablesByDomain,
  getTablesByTier,
  getDomains,
  reloadMetadataCatalog,
  getCatalogStats,
} from "./loader.js";

// Export search functions
export {
  searchTables,
  searchColumns,
  getDomainSummaries,
  suggestTablesForUseCase,
  getRelatedTables,
  type SearchOptions,
} from "./search.js";
