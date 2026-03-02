import { NextResponse } from "next/server";
import { getInstitutions } from "@/lib/gocardless";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "gb";
    const institutions = await getInstitutions(country);
    return NextResponse.json(institutions);
  } catch (error) {
    console.error("Failed to fetch institutions:", error);
    return NextResponse.json(
      { error: "Failed to fetch institutions" },
      { status: 500 }
    );
  }
}
