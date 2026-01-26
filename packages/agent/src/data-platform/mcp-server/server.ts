/**
 * Data Catalog MCP Server
 *
 * In-process MCP server using Claude Agent SDK's createSdkMcpServer.
 * Provides metadata lookup tools for the Claude Agent to discover
 * and understand tables in the data platform.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  searchTables,
  searchColumns,
  getDomainSummaries,
  getTable,
  suggestTablesForUseCase,
  getRelatedTables,
  loadMetadataCatalog,
} from "../metadata/index.js";
import type {
  TableDetails,
  TableSearchResult,
  DomainSummary,
  ConnectionTemplate,
} from "../metadata/types.js";

/**
 * Format table search results for display
 */
function formatSearchResults(results: TableSearchResult[]): string {
  if (results.length === 0) {
    return "No tables found matching your search criteria.";
  }

  const lines = ["## Search Results\n"];

  for (const result of results) {
    lines.push(`### ${result.fullPath}`);
    lines.push(`- **Description:** ${result.description}`);
    lines.push(`- **Domain:** ${result.domain}`);
    lines.push(`- **Tier:** ${result.tier}`);
    lines.push(`- **Relevance Score:** ${(result.score * 100).toFixed(0)}%`);
    if (result.matchedTerms.length > 0) {
      lines.push(`- **Matched:** ${result.matchedTerms.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format table details for display
 */
function formatTableDetails(table: TableDetails): string {
  const lines = [
    `# ${table.fullPath}\n`,
    `**Description:** ${table.description}\n`,
    `| Property | Value |`,
    `|----------|-------|`,
    `| Domain | ${table.domain} |`,
    `| Tier | ${table.tier} |`,
    `| Data Source | ${table.dataSourceName} |`,
  ];

  if (table.updateFrequency) {
    lines.push(`| Update Frequency | ${table.updateFrequency} |`);
  }
  if (table.owner) {
    lines.push(`| Owner | ${table.owner} |`);
  }
  if (table.approximateRows) {
    lines.push(`| Approximate Rows | ${table.approximateRows} |`);
  }

  lines.push("\n## Columns\n");
  lines.push("| Column | Type | Description |");
  lines.push("|--------|------|-------------|");

  for (const col of table.columns || []) {
    const nullable = col.nullable ? " (nullable)" : "";
    const pk = col.primaryKey ? " 🔑" : "";
    lines.push(`| ${col.name}${pk} | ${col.type}${nullable} | ${col.description} |`);
  }

  if (table.sampleQueries && table.sampleQueries.length > 0) {
    lines.push("\n## Sample Queries\n");
    for (const query of table.sampleQueries) {
      lines.push(`### ${query.description}`);
      if (query.useCase) {
        lines.push(`*Use case: ${query.useCase}*\n`);
      }
      lines.push("```sql");
      lines.push(query.sql.trim());
      lines.push("```\n");
    }
  }

  if (table.relatedTables && table.relatedTables.length > 0) {
    lines.push("\n## Related Tables\n");
    for (const related of table.relatedTables) {
      lines.push(`- ${related}`);
    }
  }

  if (table.tags && table.tags.length > 0) {
    lines.push(`\n**Tags:** ${table.tags.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format domain summaries for display
 */
function formatDomainSummaries(domains: DomainSummary[]): string {
  if (domains.length === 0) {
    return "No domains found in the metadata catalog.";
  }

  const lines = ["# Available Data Domains\n"];

  for (const domain of domains) {
    lines.push(`## ${domain.name}`);
    lines.push(`- **Tables:** ${domain.tableCount}`);
    lines.push(`- **Tiers:** ${domain.tiers.join(", ")}`);
    lines.push(`- **Example Tables:**`);
    for (const table of domain.exampleTables) {
      lines.push(`  - ${table}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get connection template for code generation
 */
function getConnectionTemplate(): ConnectionTemplate {
  return {
    type: "trino",
    imports: [
      "import { createServerFn } from '@tanstack/react-start'",
      "import { Trino, BasicAuth } from 'trino-client'",
    ],
    connectionCode: `
// ⚠️ CRITICAL: Environment variables are pre-configured in the container
// DO NOT create .env files with DATA_PLATFORM_* variables
// The container already has these credentials - just use process.env directly

// Create a Trino client using environment variables
function createTrinoClient() {
  const host = process.env.DATA_PLATFORM_HOST
  const user = process.env.DATA_PLATFORM_USER
  const password = process.env.DATA_PLATFORM_PASSWORD

  if (!host || !user || !password) {
    throw new Error('Missing required DATA_PLATFORM environment variables')
  }

  return Trino.create({
    server: \`https://\${host}:443\`,
    auth: new BasicAuth(user, password),
    source: 'kova-app',
  })
}

// ⚠️ SECURITY: Sanitize user input to prevent SQL injection
// NEVER use string interpolation with unsanitized user input
function sanitizeForTrino(value: string): string {
  // Escape single quotes and remove dangerous SQL characters
  return value
    .replace(/'/g, "''")           // Escape single quotes
    .replace(/[\\\\\\/\\*;\\-\\-]/g, '') // Remove SQL metacharacters
    .slice(0, 500)                  // Limit length
}

// Validate string input (use in .inputValidator())
function validateStringInput(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid input: expected non-empty string')
  }
  if (value.length > maxLength) {
    throw new Error(\`Input too long: max \${maxLength} characters\`)
  }
  return value.trim()
}
`.trim(),
    queryCode: `
// ✅ SAFE: Query with no user input
export const getTopItems = createServerFn({ method: 'GET' })
  .handler(async () => {
    const client = createTrinoClient()
    const queryIterator = await client.query(\`
      SELECT column1, column2
      FROM catalog.schema.table
      WHERE date >= current_date - interval '30' day
      LIMIT 100
    \`)

    const rows: YourResultType[] = []
    for await (const result of queryIterator) {
      if (result.data) {
        for (const row of result.data) {
          rows.push({ column1: row[0], column2: row[1] })
        }
      }
    }
    return rows
  })

// ✅ SAFE: Query with sanitized user input
export const searchItems = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => validateStringInput(input, 200))
  .handler(async ({ data: searchTerm }) => {
    const client = createTrinoClient()
    const sanitized = sanitizeForTrino(searchTerm)

    const queryIterator = await client.query(\`
      SELECT column1, column2
      FROM catalog.schema.table
      WHERE name = '\${sanitized}'
      LIMIT 100
    \`)

    const rows: YourResultType[] = []
    for await (const result of queryIterator) {
      if (result.data) {
        for (const row of result.data) {
          rows.push({ column1: row[0], column2: row[1] })
        }
      }
    }
    return rows
  })

// ❌ NEVER DO THIS - SQL injection vulnerability:
// const query = \`SELECT * FROM table WHERE id = '\${userInput}'\`
`.trim(),
    envVars: [
      "DATA_PLATFORM_HOST",
      "DATA_PLATFORM_USER",
      "DATA_PLATFORM_PASSWORD",
    ],
    envNote:
      "These environment variables are PRE-CONFIGURED in the container. " +
      "DO NOT create .env files - the credentials are already available via process.env.",
  };
}

/**
 * Initialize the metadata catalog (call this before using the MCP server)
 */
export function initializeDataCatalog(): void {
  console.log("[DataCatalog] Loading metadata catalog...");
  loadMetadataCatalog();
  console.log("[DataCatalog] Metadata catalog loaded");
}

/**
 * Data Catalog MCP Server
 *
 * Provides tools for discovering and understanding tables in the data platform.
 * Use this with Claude Agent SDK's mcpServers configuration.
 */
export const dataCatalogMcpServer = createSdkMcpServer({
  name: "data-catalog",
  version: "1.0.0",
  tools: [
    tool(
      "search_tables",
      "Search for tables in the data platform by keywords, domain, or data tier. " +
        "Use this to find relevant tables for your data needs. " +
        "Returns tables sorted by relevance with descriptions and metadata.",
      {
        query: z.string().describe(
          "Search keywords (e.g., 'revenue marketplace', 'product inventory', 'advertising campaigns')"
        ),
        domain: z.string().optional().describe(
          "Filter by domain (e.g., 'market_insights', 'inventory', 'fulfillment')"
        ),
        tier: z.enum(["MART", "INT", "STG", "RAW"]).optional().describe(
          "Filter by data tier. MART = production-ready, INT = intermediate, STG = staged, RAW = raw data"
        ),
        limit: z.number().optional().default(10).describe(
          "Maximum number of results (default: 10)"
        ),
      },
      async (args) => {
        try {
          const results = searchTables(args.query, {
            domain: args.domain,
            tier: args.tier,
            limit: args.limit,
          });
          return {
            content: [{ type: "text", text: formatSearchResults(results) }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error searching tables: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "get_table_schema",
      "Get detailed schema information for a specific table including " +
        "all columns, data types, descriptions, and sample queries. " +
        "Use this after finding a table with search_tables to understand its structure.",
      {
        table_path: z.string().describe(
          "Full table path in format: catalog.schema.table (e.g., 'data_lake.mart_market_insights.daily_marketplace_performance')"
        ),
      },
      async (args) => {
        try {
          const table = getTable(args.table_path);
          if (!table) {
            return {
              content: [
                {
                  type: "text",
                  text: `Table not found: ${args.table_path}\n\nUse search_tables to find available tables.`,
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: formatTableDetails(table) }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error getting table schema: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "get_sample_queries",
      "Get sample SQL queries for a table that demonstrate common use cases. " +
        "These queries can be used as starting points for data access code generation.",
      {
        table_path: z.string().describe(
          "Full table path in format: catalog.schema.table"
        ),
      },
      async (args) => {
        try {
          const table = getTable(args.table_path);
          if (!table) {
            return {
              content: [{ type: "text", text: `Table not found: ${args.table_path}` }],
            };
          }

          if (!table.sampleQueries || table.sampleQueries.length === 0) {
            return {
              content: [
                { type: "text", text: `No sample queries available for ${args.table_path}` },
              ],
            };
          }

          const lines = [`# Sample Queries for ${args.table_path}\n`];
          for (const query of table.sampleQueries) {
            lines.push(`## ${query.description}`);
            if (query.useCase) {
              lines.push(`*Use case: ${query.useCase}*\n`);
            }
            lines.push("```sql");
            lines.push(query.sql.trim());
            lines.push("```\n");
          }

          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error getting sample queries: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "list_domains",
      "List all available data domains in the platform with summary information. " +
        "Use this to discover what types of data are available.",
      {},
      async () => {
        try {
          const domains = getDomainSummaries();
          return {
            content: [{ type: "text", text: formatDomainSummaries(domains) }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error listing domains: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "get_connection_template",
      "Get code templates for connecting to the data platform. " +
        "Returns import statements, connection code, and query examples " +
        "that follow Spreetail's patterns for TanStack Start server functions.",
      {},
      async () => {
        try {
          const template = getConnectionTemplate();
          const lines = [
            "# Data Platform Connection Template\n",
            "## ⚠️ IMPORTANT: Environment Variables\n",
            "**DO NOT create .env files with DATA_PLATFORM_* variables.**\n",
            "The container already has these credentials pre-configured. Just use `process.env.DATA_PLATFORM_*` directly.\n",
            "## Required Imports\n",
            "```typescript",
            template.imports.join("\n"),
            "```\n",
            "## Connection Code\n",
            "```typescript",
            template.connectionCode,
            "```\n",
            "## Query Execution\n",
            "```typescript",
            template.queryCode,
            "```\n",
            "## Environment Variables (Pre-configured)\n",
            "These are already set in the container - no action needed:\n",
            template.envVars.map((v) => `- \`${v}\``).join("\n"),
          ];
          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error getting connection template: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "suggest_tables",
      "Get table suggestions based on a use case description. " +
        "Describe what you're trying to build and get relevant table recommendations.",
      {
        use_case: z.string().describe(
          "Description of what you're trying to accomplish (e.g., 'build a revenue dashboard showing marketplace performance')"
        ),
        limit: z.number().optional().default(5).describe(
          "Maximum number of suggestions (default: 5)"
        ),
      },
      async (args) => {
        try {
          const results = suggestTablesForUseCase(args.use_case, { limit: args.limit });

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No tables found matching your use case. Try using search_tables with specific keywords.",
                },
              ],
            };
          }

          const lines = [`# Suggested Tables for: "${args.use_case}"\n`];
          lines.push(formatSearchResults(results));
          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error suggesting tables: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "get_related_tables",
      "Find tables related to a given table. " +
        "Useful for understanding data relationships and building comprehensive queries.",
      {
        table_path: z.string().describe(
          "Full table path in format: catalog.schema.table"
        ),
        limit: z.number().optional().default(5).describe(
          "Maximum number of related tables (default: 5)"
        ),
      },
      async (args) => {
        try {
          const related = getRelatedTables(args.table_path, { limit: args.limit });

          if (related.length === 0) {
            return {
              content: [
                { type: "text", text: `No related tables found for ${args.table_path}` },
              ],
            };
          }

          const lines = [`# Tables Related to ${args.table_path}\n`];
          for (const table of related) {
            lines.push(`## ${table.fullPath}`);
            lines.push(`- **Description:** ${table.description}`);
            lines.push(`- **Domain:** ${table.domain}`);
            lines.push(`- **Tier:** ${table.tier}`);
            lines.push("");
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error getting related tables: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),

    tool(
      "search_columns",
      "Search for columns across all tables by name or description. " +
        "Useful when you know what data field you need but not which table contains it.",
      {
        query: z.string().describe("Column name or description to search for"),
        domain: z.string().optional().describe("Limit search to a specific domain"),
        limit: z.number().optional().default(20).describe(
          "Maximum number of results (default: 20)"
        ),
      },
      async (args) => {
        try {
          const results = searchColumns(args.query, {
            domain: args.domain,
            limit: args.limit,
          });

          if (results.length === 0) {
            return {
              content: [{ type: "text", text: `No columns found matching "${args.query}"` }],
            };
          }

          const lines = [`# Column Search Results for "${args.query}"\n`];
          for (const result of results) {
            lines.push(`## ${result.column.name}`);
            lines.push(`- **Type:** ${result.column.type}`);
            lines.push(`- **Description:** ${result.column.description}`);
            lines.push(`- **Table:** ${result.table.fullPath}`);
            lines.push(`- **Relevance:** ${(result.score * 100).toFixed(0)}%`);
            lines.push("");
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error searching columns: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    ),
  ],
});
