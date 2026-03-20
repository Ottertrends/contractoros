import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const CONTRACTOR_TOOLS: Tool[] = [
  {
    name: "create_project",
    description:
      "Create a new project when the contractor mentions a new job, client, or work site",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project or job name" },
        client_name: {
          type: "string",
          description: "Client or customer name",
        },
        location: {
          type: "string",
          description: "General location description",
        },
        address: { type: "string", description: "Street address if mentioned" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        notes: {
          type: "string",
          description: "Any additional details mentioned",
        },
        current_work: {
          type: "string",
          description: "What work is being done",
        },
        quoted_amount: {
          type: "number",
          description: "Quote amount if mentioned",
        },
        client_phone: { type: "string", description: "Client phone number" },
        client_email: { type: "string", description: "Client email address" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description:
      "Update an existing project with new information like progress, notes, status changes, or updated quotes",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "UUID of the project to update",
        },
        name: { type: "string" },
        client_name: { type: "string" },
        location: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "completed", "on_hold", "cancelled"],
        },
        notes: {
          type: "string",
          description: "Append to existing notes",
        },
        current_work: { type: "string" },
        quoted_amount: { type: "number" },
        client_phone: { type: "string" },
        client_email: { type: "string" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_projects",
    description:
      "List the user's projects, optionally filtered by status. Use when they ask about projects or when you need to find one to update.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "completed", "on_hold", "cancelled"],
        },
        search: {
          type: "string",
          description: "Search term to filter by name, client, or location",
        },
      },
    },
  },
  {
    name: "create_invoice_draft",
    description:
      "Create or update the draft invoice for a project. Each project has exactly one draft invoice. If one already exists it will be updated. Use when they ask to invoice, bill, or quote a project. If no items are provided the project's quoted_amount and current_work are used automatically.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Product or service name (short label)" },
              description: { type: "string", description: "Detailed description of the work" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
            },
            required: ["description", "quantity", "unit_price"],
          },
          description: "Line items — omit to auto-populate from project data",
        },
        notes: { type: "string", description: "Invoice notes" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_details",
    description:
      "Get full details of a specific project including any invoices",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
      },
      required: ["project_id"],
    },
  },
];
