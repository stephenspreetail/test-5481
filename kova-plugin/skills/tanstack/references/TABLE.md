# TanStack Table Reference

> **Version:** 8.x | **Updated:** 2026-01-27

TanStack Table is a headless utility for building powerful data grids. It provides hooks for core table logic while you control markup and styling.

## Installation

```bash
bun add @tanstack/react-table
```

## Core Concepts

### useReactTable Hook

```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";

interface Person {
  id: string;
  name: string;
  age: number;
}

const columns: ColumnDef<Person>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" },
];

function BasicTable({ data }: { data: Person[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### CRITICAL: Stable References

Both `data` and `columns` must have stable references:

```tsx
// CORRECT: Using useMemo for columns
const columns = useMemo<ColumnDef<Person>[]>(
  () => [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "age", header: "Age" },
  ],
  []
);

// WRONG: Defining columns inline causes infinite re-renders
const table = useReactTable({
  data,
  columns: [{ accessorKey: "name", header: "Name" }], // New array every render!
  getCoreRowModel: getCoreRowModel(),
});
```

## Column Definitions

### Using createColumnHelper (Recommended)

```tsx
import { createColumnHelper } from "@tanstack/react-table";

const columnHelper = createColumnHelper<Person>();

const columns = [
  columnHelper.accessor("firstName", {
    header: "First Name",
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: "fullName",
    header: "Full Name",
  }),

  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <button onClick={() => handleEdit(row.original)}>Edit</button>
    ),
  }),
];
```

### Column Definition Properties

```tsx
interface ColumnDef<TData> {
  id?: string;
  accessorKey?: keyof TData;
  accessorFn?: (row: TData) => unknown;
  header?: string | ((props: HeaderContext) => ReactNode);
  cell?: (props: CellContext) => ReactNode;
  footer?: string | ((props: FooterContext) => ReactNode);
  columns?: ColumnDef<TData>[]; // Nested columns
  enableSorting?: boolean;
  enableColumnFilter?: boolean;
  enableHiding?: boolean;
  size?: number;
  minSize?: number;
  maxSize?: number;
  sortingFn?: SortingFn | string;
  filterFn?: FilterFn | string;
  meta?: Record<string, unknown>;
}
```

## Sorting

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";

function SortableTable({ data }: { data: Person[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                style={{ cursor: "pointer" }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{
                  asc: " (ASC)",
                  desc: " (DESC)",
                }[header.column.getIsSorted() as string] ?? null}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      {/* ... body */}
    </table>
  );
}
```

### Built-in Sorting Functions

- `alphanumeric` - Mixed alphanumeric
- `alphanumericCaseSensitive`
- `text` - Case-insensitive
- `textCaseSensitive`
- `datetime`
- `basic`

## Filtering

### Column Filtering

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  ColumnFiltersState,
} from "@tanstack/react-table";

function FilterableTable({ data }: { data: Person[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        placeholder="Filter by name..."
        value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
        onChange={(e) =>
          table.getColumn("name")?.setFilterValue(e.target.value)
        }
      />
      {/* Table rendering */}
    </div>
  );
}
```

### Global Filtering

```tsx
function GlobalFilterTable({ data }: { data: Person[] }) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        placeholder="Search all columns..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
      />
      {/* Table rendering */}
    </div>
  );
}
```

## Pagination

### Client-Side Pagination

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  PaginationState,
} from "@tanstack/react-table";

function PaginatedTable({ data }: { data: Person[] }) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useReactTable({
    data,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      <table>{/* Table rendering */}</table>

      <div>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </span>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </button>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
        >
          {[10, 20, 30, 50].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

### Server-Side (Manual) Pagination

```tsx
import { useQuery } from "@tanstack/react-query";

function ServerPaginatedTable() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const { data: response } = useQuery({
    queryKey: ["people", pagination],
    queryFn: () => fetchPeople({
      page: pagination.pageIndex,
      pageSize: pagination.pageSize,
    }),
  });

  const table = useReactTable({
    data: response?.data ?? [],
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: response?.pageCount ?? -1,
    getCoreRowModel: getCoreRowModel(),
    // Don't use getPaginationRowModel for manual pagination
  });

  return (/* ... */);
}
```

## Row Selection

```tsx
import { RowSelectionState } from "@tanstack/react-table";

function SelectableTable({ data }: { data: Person[] }) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columns = useMemo<ColumnDef<Person>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      // ... other columns
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows;

  return (
    <div>
      <div>{selectedRows.length} of {data.length} row(s) selected</div>
      <table>{/* Table rendering */}</table>
    </div>
  );
}
```

## Column Visibility

```tsx
import { VisibilityState } from "@tanstack/react-table";

function TableWithColumnVisibility({ data }: { data: Person[] }) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    email: false, // Hide email column by default
  });

  const table = useReactTable({
    data,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <div>
        {table.getAllLeafColumns().map((column) => (
          <label key={column.id}>
            <input
              type="checkbox"
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
            {column.id}
          </label>
        ))}
      </div>
      <table>{/* Use row.getVisibleCells() */}</table>
    </div>
  );
}
```

## Integration with Spreeform

```tsx
import {
  Table,
  FlexTableHeader,
  FlexTableBody,
  SortButton,
  SortButtonIcon,
} from "@spreetail/spreeform";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";

function ProductTable({ data }: { data: Product[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortButton variant="ghost" onClick={() => column.toggleSorting()}>
            Name
            <SortButtonIcon
              sortDirection={column.getIsSorted() || undefined}
              sortType="alphabetic"
            />
          </SortButton>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <SortButton variant="ghost" onClick={() => column.toggleSorting()}>
            Price
            <SortButtonIcon
              sortDirection={column.getIsSorted() || undefined}
              sortType="numeric"
            />
          </SortButton>
        ),
        cell: ({ getValue }) => `$${getValue<number>().toFixed(2)}`,
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <FlexTableHeader table={table} />
      <FlexTableBody
        table={table}
        fallback={<div>No products found</div>}
      />
    </Table>
  );
}
```

## Common Patterns

### Action Column with Dropdown

```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Button } from "@spreetail/spreeform";
import { MoreHorizontal, Edit, Trash } from "lucide-react";

const columnHelper = createColumnHelper<Product>();

const columns = [
  // ... data columns

  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleEdit(row.original)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }),
];
```

### Row Click Handler

```tsx
<TableBody>
  {table.getRowModel().rows.map((row) => (
    <TableRow
      key={row.id}
      onClick={() => handleRowClick(row.original)}
      className="cursor-pointer hover:bg-muted"
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  ))}
</TableBody>
```

### Loading State

```tsx
function DataTable({ isLoading, data }: Props) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <Table>
        <TableHeader>{/* Render headers normally */}</TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {columns.map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <FlexTableHeader table={table} />
      <FlexTableBody table={table} />
    </Table>
  );
}
```

## Row Model Processing Order

1. `getCoreRowModel` - Initial data mapping
2. `getFilteredRowModel` - Apply filters
3. `getGroupedRowModel` - Apply grouping
4. `getSortedRowModel` - Apply sorting
5. `getExpandedRowModel` - Handle expansion
6. `getPaginationRowModel` - Apply pagination
