import { createClient } from "../../../../../lib/supabase/server";
import {
  generateMonthlyDtrPdf,
  type MonthlyDtrSnapshot,
} from "../../../../../lib/monthly-dtr-report";
import fontData from "../../../../../lib/report-assets/DejaVuSans.ttf?inline";
import sealData from "../../../../../lib/report-assets/parsu-logo.png?inline";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
};

function decodeInlineAsset(url: string) {
  return Uint8Array.from(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Not found", { status: 404, headers: privateHeaders });
  }

  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return new Response("Sign in to view this monthly DTR.", {
        status: 401,
        headers: privateHeaders,
      });
    }

    const { data, error } = await supabase.rpc("get_monthly_dtr_report", {
      p_report_id: id,
    });
    if (error || !data) {
      return new Response("This monthly DTR is not available to your account.", {
        status: 404,
        headers: privateHeaders,
      });
    }

    const report = data as unknown as MonthlyDtrSnapshot;
    const bytes = await generateMonthlyDtrPdf(report, {
      font: decodeInlineAsset(fontData),
      seal: decodeInlineAsset(sealData),
    });
    const disposition = new URL(request.url).searchParams.get("download") === "1"
      ? "attachment"
      : "inline";
    const safeReference = report.reportReference.replace(/[^A-Za-z0-9_-]/g, "-");
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${safeReference}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Monthly DTR PDF generation failed", {
      category: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("The monthly DTR could not be generated. Please try again.", {
      status: 500,
      headers: privateHeaders,
    });
  }
}
