"use server";

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/stock/route";
import { PUT, DELETE } from "@/app/api/stock/[id]/route";

// Actions share the HTTP write path, including station scope, lot validation and audit.
async function request(method: string, body?: unknown) {
  const incoming = new Headers(await headers());
  incoming.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/stock", {
    method, headers: incoming, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function createStockItem(data: Record<string, unknown>) {
  return POST(await request("POST", data));
}

export async function createStockBulk(items: Record<string, unknown>[]) {
  return POST(await request("POST", items));
}

export async function updateStockItem(id: number, data: Record<string, unknown>) {
  return PUT(await request("PUT", data), { params: Promise.resolve({ id: String(id) }) });
}

export async function deleteStockItem(id: number) {
  return DELETE(await request("DELETE"), { params: Promise.resolve({ id: String(id) }) });
}
