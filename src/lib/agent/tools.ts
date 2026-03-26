import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const CONTRACTOR_TOOLS: Tool[] = [
  // ── Projects ────────────────────────────────────────────────────────────────
  {
    name: "create_project",
    description:
      "Create a new project when the contractor mentions a new job, client, or work site. Always call list_clients first if a client name is mentioned.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project or job name" },
        client_name: { type: "string", description: "Client or customer name" },
        client_phone: { type: "string", description: "Client phone number" },
        client_email: { type: "string", description: "Client email address" },
        address: { type: "string", description: "Street address" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State (2-letter abbreviation preferred)" },
        zip: { type: "string", description: "ZIP code" },
        location: { type: "string", description: "General location description if no address" },
        notes: { type: "string", description: "Private notes — not shown on invoices" },
        current_work: { type: "string", description: "What work is currently being done" },
        quoted_amount: { type: "number", description: "Quote amount in USD if mentioned" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Labels like 'concrete', 'remodel', 'fence'",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description:
      "Update an existing project with new info: progress notes, status changes, updated quote, contact details, or address. Call list_projects first to find the project_id.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project to update" },
        name: { type: "string" },
        client_name: { type: "string" },
        client_phone: { type: "string" },
        client_email: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        zip: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "completed", "on_hold", "cancelled"],
          description: "New project status",
        },
        notes: { type: "string", description: "Note to APPEND to existing notes" },
        current_work: { type: "string", description: "What is currently being worked on" },
        quoted_amount: { type: "number", description: "Updated quote amount in USD" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_projects",
    description:
      "List the 10 most recently updated projects (no search). With a search term, searches name, client, address, notes and current work — returns up to 20 results. Use when identifying which project the contractor is referring to.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "completed", "on_hold", "cancelled"],
          description: "Filter by status (omit for all statuses)",
        },
        search: {
          type: "string",
          description: "Hint from contractor — searches name, client, address, current_work, notes",
        },
      },
    },
  },
  {
    name: "get_project_details",
    description:
      "Get the full details of a specific project including all invoices and invoice line items.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
      },
      required: ["project_id"],
    },
  },

  // ── Invoices ────────────────────────────────────────────────────────────────
  {
    name: "create_invoice_draft",
    description:
      "Create or update the draft invoice for a project. Always call list_price_book first to find standard prices for the work. If no items are provided, the project's quoted_amount and current_work are used. Each project has exactly one draft — this tool updates it if one already exists.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        items: {
          type: "array",
          description: "Line items — build from price book data. Omit to auto-populate from project.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short label (e.g. 'Concrete — 200 sqft')" },
              description: { type: "string", description: "Full description of the work or material" },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Price per unit in USD" },
            },
            required: ["description", "quantity", "unit_price"],
          },
        },
        notes: { type: "string", description: "Notes visible on the PDF invoice" },
        tax_rate: { type: "number", description: "Tax percentage (e.g. 8.25 for 8.25%). Defaults to 0." },
      },
      required: ["project_id"],
    },
  },
  {
    name: "update_invoice_status",
    description:
      "Change the status of an invoice. Use when contractor says they sent, received payment, or wants to cancel an invoice. Provide either invoice_id or project_id (updates the most recent invoice for that project).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "sent", "paid", "cancelled"],
          description: "New invoice status",
        },
        invoice_id: { type: "string", description: "UUID of the specific invoice (preferred)" },
        project_id: { type: "string", description: "UUID of the project — updates most recent invoice" },
      },
      required: ["status"],
    },
  },

  // ── Clients ────────────────────────────────────────────────────────────────
  {
    name: "list_clients",
    description:
      "Search the saved client directory. Call this when a client name is mentioned to check for existing contact info (address, phone, email) before creating a project.",
    input_schema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Client name, phone, email, or address to search for",
        },
      },
    },
  },
  {
    name: "save_client",
    description:
      "Create a new client or update an existing one in the client directory. Call this whenever a project is created with contact info, or when the contractor shares new client details.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Full client name" },
        address: { type: "string", description: "Street address" },
        city: { type: "string" },
        state: { type: "string" },
        zip: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        notes: { type: "string", description: "Notes about this client" },
      },
      required: ["client_name"],
    },
  },

  // ── Price Book ───────────────────────────────────────────────────────────
  {
    name: "list_price_book",
    description:
      "Get standard service/material prices from the contractor's price book. Always call this before creating an invoice or answering pricing questions. Use the search param to find relevant items by service type or category.",
    input_schema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Service type, material, or category to search (e.g. 'concrete', 'labor', 'fence')",
        },
      },
    },
  },
  {
    name: "add_price_book_item",
    description:
      "Add a new item to the contractor's price book. Use when they mention a new service or material price they want to save for future invoices.",
    input_schema: {
      type: "object",
      properties: {
        item_name: { type: "string", description: "Short name of the service or material" },
        description: { type: "string", description: "Detailed description" },
        unit_price: { type: "number", description: "Price per unit in USD" },
        unit: { type: "string", description: "Unit of measure (e.g. 'sqft', 'hr', 'each', 'lb')" },
        category: { type: "string", description: "Category (e.g. 'Concrete', 'Labor', 'Materials')" },
        supplier: { type: "string", description: "Supplier name if applicable" },
      },
      required: ["item_name", "unit_price"],
    },
  },

  // ── Media ───────────────────────────────────────────────────────────────
  {
    name: "attach_media_to_project",
    description:
      "Associate a received photo or video with a project. Use after the contractor confirms which project the media belongs to.",
    input_schema: {
      type: "object",
      properties: {
        media_id: { type: "string", description: "UUID of the project_media record" },
        project_id: { type: "string", description: "UUID of the project to attach to" },
        description: { type: "string", description: "Optional description of what the photo/video shows" },
      },
      required: ["media_id", "project_id"],
    },
  },
];
