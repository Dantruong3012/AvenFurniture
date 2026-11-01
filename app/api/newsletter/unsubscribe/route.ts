import { unsubscribeNewsletter } from "@/lib/newsletter/actions";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  let result;
  try {
    result = await unsubscribeNewsletter({}, form);
  } catch {
    result = { error: "Unable to update your preference. Please try again later." };
  }
  const destination = new URL("/newsletter/unsubscribe", request.url);
  destination.searchParams.set("status", result.error ? "error" : "done");
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
