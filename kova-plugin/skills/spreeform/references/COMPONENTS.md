# Spreeform Component Reference

Complete reference for all Spreeform components with variants, props, and usage examples.

## Table of Contents

- [Form Components](#form-components)
- [Layout Components](#layout-components)
- [Display Components](#display-components)
- [Navigation Components](#navigation-components)
- [Overlay Components](#overlay-components)
- [Menu Components](#menu-components)
- [Data Components](#data-components)

---

## Form Components

### Button

```tsx
import { Button, buttonVariants } from "@spreetail/spreeform";

<Button
  variant="default"  // 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'link-primary' | 'link-destructive' | 'input'
  size="default"     // 'default' | 'sm' | 'lg' | 'icon'
  asChild           // Use Slot pattern
>
  Click me
</Button>
```

### ButtonGroup

```tsx
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@spreetail/spreeform";

<ButtonGroup orientation="horizontal"> {/* 'horizontal' | 'vertical' */}
  <Button>Left</Button>
  <ButtonGroupSeparator />
  <Button>Right</Button>
</ButtonGroup>
```

### Input

```tsx
import { Input } from "@spreetail/spreeform";

<Input type="text" placeholder="Enter value..." />
```

### InputGroup

```tsx
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@spreetail/spreeform";

<InputGroup>
  <InputGroupAddon align="inline-start"> {/* 'block-start' | 'block-end' | 'inline-start' | 'inline-end' */}
    <InputGroupText>$</InputGroupText>
  </InputGroupAddon>
  <InputGroupInput placeholder="Amount" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton size="sm">Submit</InputGroupButton> {/* size: 'xs' | 'sm' | 'icon-xs' | 'icon-sm' */}
  </InputGroupAddon>
</InputGroup>
```

### Textarea

```tsx
import { Textarea } from "@spreetail/spreeform";

<Textarea placeholder="Enter description..." rows={4} />
```

### DebouncedInput / DebouncedTextarea

```tsx
import { DebouncedInput, DebouncedTextarea } from "@spreetail/spreeform";

<DebouncedInput
  delay={300}
  value={searchTerm}
  onValueChange={(value) => setSearchTerm(value)}
/>
```

### Checkbox

```tsx
import { Checkbox } from "@spreetail/spreeform";

<Checkbox checked={isChecked} onCheckedChange={setIsChecked} />
```

### Switch

```tsx
import { Switch } from "@spreetail/spreeform";

<Switch checked={enabled} onCheckedChange={setEnabled} />
```

### RadioGroup

```tsx
import { RadioGroup, RadioGroupItem } from "@spreetail/spreeform";

<RadioGroup value={selected} onValueChange={setSelected}>
  <RadioGroupItem value="option1" />
  <RadioGroupItem value="option2" />
</RadioGroup>
```

### Select

```tsx
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@spreetail/spreeform";

<Select value={value} onValueChange={setValue}>
  <SelectTrigger size="default"> {/* size?: 'default' | 'sm' */}
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Options</SelectLabel>
      <SelectItem value="1">Option 1</SelectItem>
      <SelectItem value="2">Option 2</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

### Slider

```tsx
import { Slider } from "@spreetail/spreeform";

<Slider defaultValue={[50]} min={0} max={100} step={1} />
```

### Toggle

```tsx
import { Toggle, ToggleGroup, ToggleGroupItem, toggleVariants } from "@spreetail/spreeform";

// Single toggle
<Toggle
  variant="default"  // 'default' | 'outline'
  size="default"     // 'default' | 'sm' | 'lg'
  pressed={isPressed}
  onPressedChange={setIsPressed}
>
  Toggle
</Toggle>

// Toggle group
<ToggleGroup type="single" value={value} onValueChange={setValue}>
  <ToggleGroupItem value="a">A</ToggleGroupItem>
  <ToggleGroupItem value="b">B</ToggleGroupItem>
</ToggleGroup>
```

### InputOTP

```tsx
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@spreetail/spreeform";

<InputOTP maxLength={6}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
  </InputOTPGroup>
  <InputOTPSeparator />
  <InputOTPGroup>
    <InputOTPSlot index={3} />
    <InputOTPSlot index={4} />
    <InputOTPSlot index={5} />
  </InputOTPGroup>
</InputOTP>
```

### Form (React Hook Form Integration)

```tsx
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField } from "@spreetail/spreeform";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

function MyForm() {
  const form = useForm({ resolver: zodResolver(schema) });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>Your email address</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}
```

### Field (Standalone)

```tsx
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@spreetail/spreeform";

<Field orientation="horizontal"> {/* 'horizontal' | 'vertical' | 'responsive' */}
  <FieldLabel>Username</FieldLabel>
  <FieldContent>
    <Input />
    <FieldDescription>Your unique username</FieldDescription>
    <FieldError errors={["Username is required"]} />
  </FieldContent>
</Field>
```

### FileDrop

```tsx
import { FileDrop, FileDropDescription, FileDropIcon, FileDropLabel, FileDropLink, FileDropTrigger } from "@spreetail/spreeform";

<FileDrop
  accept={{ "image/*": [".png", ".jpg"] }}
  onDrop={(files) => handleFiles(files)}
>
  <FileDropTrigger>
    <FileDropIcon />
    <FileDropLabel>Drop files here</FileDropLabel>
    <FileDropDescription>or click to browse</FileDropDescription>
    <FileDropLink>Browse files</FileDropLink>
  </FileDropTrigger>
</FileDrop>
```

---

## Layout Components

### Page Layout

```tsx
import {
  Page, PageBody, PageContainer, PageFooter, PageFooterContainer,
  PageHeader, PageHeaderActions, PageHeaderContainer, PageHeaderContent, PageHeaderTitle,
  PageMenu, PageMenuLabel, PageMenuList, PageMenuTrigger
} from "@spreetail/spreeform";

<Page
  sidebar={<MySidebar />}
  sidebarProviderProps={{ defaultOpen: true }}
  themeProviderProps={{ defaultTheme: "system" }}
  toasterProps={{}}
>
  <PageHeader>
    <PageHeaderContainer>
      <PageHeaderContent>
        <PageHeaderTitle>Dashboard</PageHeaderTitle>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button>Action</Button>
      </PageHeaderActions>
    </PageHeaderContainer>
  </PageHeader>
  <PageBody>
    <PageContainer variant="default"> {/* 'default' | 'wide' | 'full' */}
      Content here
    </PageContainer>
  </PageBody>
  <PageFooter>
    <PageFooterContainer>Footer</PageFooterContainer>
  </PageFooter>
</Page>
```

### Sidebar

```tsx
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset,
  SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar
} from "@spreetail/spreeform";

<SidebarProvider defaultOpen={true}>
  <Sidebar
    side="left"           // 'left' | 'right'
    variant="sidebar"     // 'sidebar' | 'floating' | 'inset'
    collapsible="icon"    // 'offcanvas' | 'icon' | 'none'
    expandable="push"     // 'push' | 'overlay'
    toggleOnClickOutside
  >
    <SidebarHeader>Logo</SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive
                tooltip="Dashboard"
                variant="default"  // 'default' | 'outline'
                size="default"     // 'default' | 'sm' | 'lg'
              >
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>Footer</SidebarFooter>
    <SidebarRail />
  </Sidebar>
  <SidebarInset>
    <main>Content</main>
  </SidebarInset>
</SidebarProvider>
```

### ScrollArea

```tsx
import { ScrollArea, ScrollBar } from "@spreetail/spreeform";

<ScrollArea className="h-[200px] w-[350px]">
  <div>Long content here...</div>
  <ScrollBar orientation="vertical" />
</ScrollArea>
```

### AspectRatio

```tsx
import { AspectRatio } from "@spreetail/spreeform";

<AspectRatio ratio={16 / 9}>
  <img src="image.jpg" alt="Image" />
</AspectRatio>
```

### Resizable Panels

```tsx
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@spreetail/spreeform";

<ResizablePanelGroup direction="horizontal">
  <ResizablePanel>Panel 1</ResizablePanel>
  <ResizableHandle />
  <ResizablePanel>Panel 2</ResizablePanel>
</ResizablePanelGroup>
```

---

## Display Components

### Card

```tsx
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@spreetail/spreeform";

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
    <CardAction>
      <Button variant="ghost" size="icon">...</Button>
    </CardAction>
  </CardHeader>
  <CardContent>Content goes here</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Badge

```tsx
import { Badge, badgeVariants } from "@spreetail/spreeform";

<Badge
  variant="default"  // 'default' | 'secondary' | 'destructive' | 'outline' | 'outline-primary' | 'info' | 'destructive-secondary' | 'successful' | 'warning' | 'orange' | 'blue' | 'violet' | 'pink'
  shape="default"
>
  Badge Text
</Badge>
```

### Alert

```tsx
import { Alert, AlertDescription, AlertTitle } from "@spreetail/spreeform";

<Alert variant="default"> {/* 'default' | 'destructive' | 'primary' | 'link' */}
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>You can add components to your app.</AlertDescription>
</Alert>
```

### Avatar

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@spreetail/spreeform";

<Avatar>
  <AvatarImage src="https://example.com/avatar.jpg" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

### Separator

```tsx
import { Separator } from "@spreetail/spreeform";

<Separator orientation="horizontal" /> {/* 'horizontal' | 'vertical' */}
```

### Skeleton

```tsx
import { Skeleton } from "@spreetail/spreeform";

<Skeleton className="h-4 w-[250px]" />
```

### Progress

```tsx
import { Progress } from "@spreetail/spreeform";

<Progress value={66} />
```

### Label

```tsx
import { Label } from "@spreetail/spreeform";

<Label htmlFor="email">Email</Label>
```

### Kbd (Keyboard)

```tsx
import { Kbd, KbdGroup } from "@spreetail/spreeform";

<KbdGroup>
  <Kbd>Ctrl</Kbd>
  <Kbd>C</Kbd>
</KbdGroup>
```

### Item Components

```tsx
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemHeader, ItemMedia, ItemSeparator, ItemTitle } from "@spreetail/spreeform";

<Item
  variant="default"  // 'default' | 'outline' | 'muted'
  size="default"     // 'default' | 'sm'
>
  <ItemMedia variant="default" />
  <ItemHeader>
    <ItemTitle>Item Title</ItemTitle>
    <ItemDescription>Description</ItemDescription>
  </ItemHeader>
  <ItemContent>Content</ItemContent>
  <ItemActions>
    <Button size="icon" variant="ghost">...</Button>
  </ItemActions>
</Item>
```

### MediaListItem

```tsx
import { MediaListItem, MediaListItemActions, MediaListItemContent, MediaListItemDescription, MediaListItemTitle } from "@spreetail/spreeform";

<MediaListItem error={hasError}>
  <MediaListItemContent>
    <MediaListItemTitle>File.pdf</MediaListItemTitle>
    <MediaListItemDescription>2.5 MB</MediaListItemDescription>
  </MediaListItemContent>
  <MediaListItemActions>
    <Button variant="ghost" size="icon">X</Button>
  </MediaListItemActions>
</MediaListItem>
```

### MediaTile

```tsx
import { MediaTile } from "@spreetail/spreeform";

<MediaTile
  src="image.jpg"
  size="md"         // 'sm' | 'md' | 'lg' | 'xl'
  state="default"   // 'default' | 'error'
/>
```

---

## Navigation Components

### Breadcrumb

```tsx
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@spreetail/spreeform";

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="/products">Products</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Current Page</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

### Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@spreetail/spreeform";

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

### NavigationMenu

```tsx
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle } from "@spreetail/spreeform";

<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuTrigger>Item 1</NavigationMenuTrigger>
      <NavigationMenuContent>
        <NavigationMenuLink href="/page">Link</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>
```

### Pagination

```tsx
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@spreetail/spreeform";

<Pagination>
  <PaginationContent>
    <PaginationItem>
      <PaginationPrevious href="#" />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#" isActive>1</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">2</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationEllipsis />
    </PaginationItem>
    <PaginationItem>
      <PaginationNext href="#" />
    </PaginationItem>
  </PaginationContent>
</Pagination>
```

---

## Overlay Components

### Dialog

```tsx
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@spreetail/spreeform";

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Content</div>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button>Continue</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### AlertDialog

```tsx
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@spreetail/spreeform";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Sheet

```tsx
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@spreetail/spreeform";

<Sheet>
  <SheetTrigger asChild>
    <Button>Open Sheet</Button>
  </SheetTrigger>
  <SheetContent side="right"> {/* 'top' | 'right' | 'bottom' | 'left' */}
    <SheetHeader>
      <SheetTitle>Sheet Title</SheetTitle>
      <SheetDescription>Sheet description</SheetDescription>
    </SheetHeader>
    <div>Content</div>
    <SheetFooter>
      <SheetClose asChild>
        <Button>Close</Button>
      </SheetClose>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

### Drawer

```tsx
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@spreetail/spreeform";

<Drawer>
  <DrawerTrigger asChild>
    <Button>Open Drawer</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Drawer Title</DrawerTitle>
      <DrawerDescription>Description</DrawerDescription>
    </DrawerHeader>
    <div>Content</div>
    <DrawerFooter>
      <Button>Submit</Button>
      <DrawerClose asChild>
        <Button variant="outline">Cancel</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

### Popover

```tsx
import { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverPortal, PopoverTrigger } from "@spreetail/spreeform";

<Popover>
  <PopoverTrigger asChild>
    <Button>Open Popover</Button>
  </PopoverTrigger>
  <PopoverContent align="center" sideOffset={4}>
    Popover content
  </PopoverContent>
</Popover>
```

### Tooltip

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@spreetail/spreeform";

<TooltipProvider delayDuration={300}>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button>Hover me</Button>
    </TooltipTrigger>
    <TooltipContent sideOffset={4}>Tooltip text</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### HoverCard

```tsx
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from "@spreetail/spreeform";

<HoverCard>
  <HoverCardTrigger asChild>
    <a href="#">@username</a>
  </HoverCardTrigger>
  <HoverCardContent align="start" sideOffset={4}>
    User profile preview
  </HoverCardContent>
</HoverCard>
```

---

## Menu Components

### DropdownMenu

```tsx
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@spreetail/spreeform";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>Open Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent sideOffset={4}>
    <DropdownMenuLabel>My Account</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuItem inset>
        Profile
        <DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem> {/* variant: 'default' | 'destructive' */}
    </DropdownMenuGroup>
  </DropdownMenuContent>
</DropdownMenu>
```

### ContextMenu

```tsx
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@spreetail/spreeform";

<ContextMenu>
  <ContextMenuTrigger>Right click here</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Copy</ContextMenuItem>
    <ContextMenuItem>Paste</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

### Menubar

```tsx
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from "@spreetail/spreeform";

<Menubar>
  <MenubarMenu>
    <MenubarTrigger>File</MenubarTrigger>
    <MenubarContent align="start" alignOffset={-3} sideOffset={8}>
      <MenubarItem>New File</MenubarItem>
      <MenubarItem>Open</MenubarItem>
      <MenubarSeparator />
      <MenubarItem>Exit</MenubarItem>
    </MenubarContent>
  </MenubarMenu>
</Menubar>
```

---

## Data Components

### Table

```tsx
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TablePagination, TableRow } from "@spreetail/spreeform";

<Table>
  <TableCaption>A list of items</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item 1</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell colSpan={2}>Total: 1</TableCell>
    </TableRow>
  </TableFooter>
</Table>
```

### FlexTable (TanStack Table)

```tsx
import { FlexTableBody, FlexTableHeader } from "@spreetail/spreeform";

<Table>
  <FlexTableHeader table={table} />
  <FlexTableBody table={table} fallback={<EmptyState />} />
</Table>
```

### SortButton

```tsx
import { SortButton, SortButtonIcon, getSortButtonType } from "@spreetail/spreeform";

<SortButton variant="ghost">
  Column Name
  <SortButtonIcon sortDirection="asc" sortType="alphabetic" />
</SortButton>
```

### Accordion

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@spreetail/spreeform";

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section 1</AccordionTrigger>
    <AccordionContent>Content 1</AccordionContent>
  </AccordionItem>
</Accordion>
```

### Collapsible

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@spreetail/spreeform";

<Collapsible>
  <CollapsibleTrigger asChild>
    <Button variant="ghost">Toggle</Button>
  </CollapsibleTrigger>
  <CollapsibleContent>Hidden content</CollapsibleContent>
</Collapsible>
```

### Calendar

```tsx
import { Calendar } from "@spreetail/spreeform";

<Calendar mode="single" selected={date} onSelect={setDate} showOutsideDays />
```

### Carousel

```tsx
import { Carousel } from "@spreetail/spreeform";

<Carousel orientation="horizontal" opts={{ loop: true }}>
  {/* CarouselContent, CarouselItem from embla */}
</Carousel>
```

### Command (cmdk)

```tsx
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@spreetail/spreeform";

<Command>
  <CommandInput placeholder="Type a command..." />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Suggestions">
      <CommandItem>
        Calendar
        <CommandShortcut>Ctrl+C</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

### Charts (Recharts)

```tsx
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@spreetail/spreeform";

const chartConfig = {
  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
  mobile: { label: "Mobile", color: "hsl(var(--chart-2))" },
};

<ChartContainer config={chartConfig}>
  <BarChart data={data}>
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend content={<ChartLegendContent />} />
    {/* Bar, Line, etc. from recharts */}
  </BarChart>
</ChartContainer>
```

### Toast Notifications (Sonner)

```tsx
import { Toaster, error, info } from "@spreetail/spreeform";

// Add Toaster to your app root
<Toaster />

// Show toasts anywhere
info("This is an info message");
error("This is an error message");
```
