/**
 * Metadata Catalog Loader
 *
 * Loads and parses YAML metadata files that describe
 * tables and schemas in the data platform.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type {
  DataSourceMetadata,
  TableMetadata,
  SchemaMetadata,
  CatalogMetadata,
  TableDetails,
} from "./types.js";
import { loadDbtMetadata } from "./dbt-converter.js";

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default paths for metadata sources
// In production (dist), sources are copied alongside compiled JS
// In development, sources are in the source directory
const DIST_SOURCES_PATH = join(__dirname, "sources");
const DIST_DBT_PATH = join(__dirname, "dbt");
const SRC_SOURCES_PATH = join(__dirname, "..", "..", "..", "data-platform", "metadata", "sources");
const SRC_DBT_PATH = join(__dirname, "..", "..", "..", "data-platform", "metadata", "dbt");

// Use environment variable or check which path exists
function getDefaultSourcesPath(): string {
  if (process.env.METADATA_SOURCES_PATH) {
    return process.env.METADATA_SOURCES_PATH;
  }
  // Try dist path first, then source path
  if (existsSync(DIST_SOURCES_PATH)) {
    return DIST_SOURCES_PATH;
  }
  if (existsSync(SRC_SOURCES_PATH)) {
    return SRC_SOURCES_PATH;
  }
  // Fallback to dist path (will show warning when loading)
  return DIST_SOURCES_PATH;
}

function getDefaultDbtPath(): string {
  if (process.env.METADATA_DBT_PATH) {
    return process.env.METADATA_DBT_PATH;
  }
  // Try dist path first, then source path
  if (existsSync(DIST_DBT_PATH)) {
    return DIST_DBT_PATH;
  }
  if (existsSync(SRC_DBT_PATH)) {
    return SRC_DBT_PATH;
  }
  return DIST_DBT_PATH;
}

const DEFAULT_SOURCES_PATH = getDefaultSourcesPath();
const DEFAULT_DBT_PATH = getDefaultDbtPath();

/**
 * Loaded metadata catalog
 */
interface MetadataCatalog {
  dataSources: Map<string, DataSourceMetadata>;
  tables: Map<string, TableDetails>;
  loadedAt: Date;
}

// Global catalog instance (singleton)
let catalog: MetadataCatalog | null = null;

/**
 * Load a single YAML metadata file
 */
function loadYamlFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, "utf-8");
    return parseYaml(content) as T;
  } catch (error) {
    throw new Error(
      `Failed to load metadata file ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Build full table details from nested metadata structure
 */
function buildTableDetails(
  dataSource: DataSourceMetadata,
  catalog: CatalogMetadata,
  schema: SchemaMetadata,
  table: TableMetadata
): TableDetails {
  return {
    ...table,
    fullPath: `${catalog.name}.${schema.name}.${table.name}`,
    schemaName: schema.name,
    catalogName: catalog.name,
    dataSourceId: dataSource.id,
    dataSourceName: dataSource.name,
    // Inherit tier and domain from schema if not specified on table
    tier: table.tier || schema.tier,
    domain: table.domain || schema.domain,
  };
}

/**
 * Index tables from a data source into the tables map
 */
function indexDataSourceTables(
  dataSource: DataSourceMetadata,
  tables: Map<string, TableDetails>
): void {
  for (const catalogMeta of dataSource.catalogs || []) {
    for (const schema of catalogMeta.schemas || []) {
      for (const table of schema.tables || []) {
        const tableDetails = buildTableDetails(
          dataSource,
          catalogMeta,
          schema,
          table
        );
        tables.set(tableDetails.fullPath, tableDetails);
      }
    }
  }
}

/**
 * Load all metadata files from the sources directory and dbt directory
 *
 * Sources are loaded from two locations:
 * 1. sources/ - Native metadata YAML files
 * 2. dbt/ - dbt schema.yml files (auto-converted at load time)
 */
export function loadMetadataCatalog(
  sourcesPath: string = DEFAULT_SOURCES_PATH,
  dbtPath: string = DEFAULT_DBT_PATH
): MetadataCatalog {
  // Return cached catalog if already loaded
  if (catalog) {
    return catalog;
  }

  const dataSources = new Map<string, DataSourceMetadata>();
  const tables = new Map<string, TableDetails>();

  // --- Load native metadata from sources/ ---
  if (existsSync(sourcesPath)) {
    const files = readdirSync(sourcesPath).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    console.log(
      `[MetadataLoader] Loading ${files.length} metadata files from ${sourcesPath}`
    );

    for (const file of files) {
      const filePath = join(sourcesPath, file);

      try {
        const dataSource = loadYamlFile<DataSourceMetadata>(filePath);

        // Validate required fields
        if (!dataSource.id || !dataSource.name || !dataSource.type) {
          console.warn(
            `[MetadataLoader] Skipping ${file}: missing required fields (id, name, type)`
          );
          continue;
        }

        dataSources.set(dataSource.id, dataSource);
        indexDataSourceTables(dataSource, tables);

        console.log(
          `[MetadataLoader] Loaded ${file}: ${dataSource.name} (${tables.size} tables total)`
        );
      } catch (error) {
        console.error(
          `[MetadataLoader] Failed to load ${file}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  } else {
    console.log(`[MetadataLoader] No sources directory found at ${sourcesPath}`);
  }

  // --- Auto-convert dbt files from dbt/ ---
  if (existsSync(dbtPath)) {
    console.log(`[MetadataLoader] Checking for dbt schemas in ${dbtPath}`);
    const dbtDataSource = loadDbtMetadata(dbtPath);

    if (dbtDataSource) {
      dataSources.set(dbtDataSource.id, dbtDataSource);
      indexDataSourceTables(dbtDataSource, tables);
      console.log(
        `[MetadataLoader] Loaded dbt schemas: ${dbtDataSource.name} (${tables.size} tables total)`
      );
    }
  }

  catalog = {
    dataSources,
    tables,
    loadedAt: new Date(),
  };

  console.log(
    `[MetadataLoader] Catalog loaded: ${dataSources.size} data sources, ${tables.size} tables`
  );

  return catalog;
}

/**
 * Get all loaded data sources
 */
export function getDataSources(): DataSourceMetadata[] {
  const cat = loadMetadataCatalog();
  return Array.from(cat.dataSources.values());
}

/**
 * Get a specific data source by ID
 */
export function getDataSource(id: string): DataSourceMetadata | undefined {
  const cat = loadMetadataCatalog();
  return cat.dataSources.get(id);
}

/**
 * Get all tables in the catalog
 */
export function getAllTables(): TableDetails[] {
  const cat = loadMetadataCatalog();
  return Array.from(cat.tables.values());
}

/**
 * Get a specific table by full path (catalog.schema.table)
 */
export function getTable(fullPath: string): TableDetails | undefined {
  const cat = loadMetadataCatalog();
  return cat.tables.get(fullPath);
}

/**
 * Get tables by domain
 */
export function getTablesByDomain(domain: string): TableDetails[] {
  const cat = loadMetadataCatalog();
  return Array.from(cat.tables.values()).filter(
    (t) => t.domain.toLowerCase() === domain.toLowerCase()
  );
}

/**
 * Get tables by tier
 */
export function getTablesByTier(tier: string): TableDetails[] {
  const cat = loadMetadataCatalog();
  return Array.from(cat.tables.values()).filter(
    (t) => t.tier.toUpperCase() === tier.toUpperCase()
  );
}

/**
 * Get all unique domains in the catalog
 */
export function getDomains(): string[] {
  const cat = loadMetadataCatalog();
  const domains = new Set<string>();
  for (const table of cat.tables.values()) {
    if (table.domain) {
      domains.add(table.domain);
    }
  }
  return Array.from(domains).sort();
}

/**
 * Reload the metadata catalog from disk
 * Use this to pick up changes to YAML files
 */
export function reloadMetadataCatalog(
  sourcesPath: string = DEFAULT_SOURCES_PATH
): MetadataCatalog {
  catalog = null;
  return loadMetadataCatalog(sourcesPath);
}

/**
 * Get catalog statistics
 */
export function getCatalogStats(): {
  dataSourceCount: number;
  tableCount: number;
  domainCount: number;
  loadedAt: Date | null;
} {
  if (!catalog) {
    return {
      dataSourceCount: 0,
      tableCount: 0,
      domainCount: 0,
      loadedAt: null,
    };
  }

  return {
    dataSourceCount: catalog.dataSources.size,
    tableCount: catalog.tables.size,
    domainCount: getDomains().length,
    loadedAt: catalog.loadedAt,
  };
}
