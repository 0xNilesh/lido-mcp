type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function success(data: Record<string, unknown>): ToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function error(message: string): ToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
  };
}
