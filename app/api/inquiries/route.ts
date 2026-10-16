import { submitCustomerInquiry } from "@/lib/repositories/supabaseInquiryRepository";
import { validateCustomerInquiryInput } from "@/lib/validation/inquiry";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ success: false, error: "Enter a valid JSON inquiry.", fields: {} }, { status: 400 });
  }
  const validated = validateCustomerInquiryInput(input);
  if (!validated.success) {
    return Response.json({ success: false, error: validated.error, fields: validated.fields }, { status: 400 });
  }
  const { source, items } = validated.data;
  if (source === "manual") {
    return Response.json({ success: false, error: "Choose a storefront inquiry source.", fields: { source: "Choose cart, product, or contact." } }, { status: 400 });
  }
  if ((source === "cart" && items.length === 0) || (source === "product" && items.length !== 1)) {
    return Response.json({ success: false, error: "Check your selected products.", fields: { items: "A cart needs at least one item; a product inquiry needs exactly one." } }, { status: 400 });
  }
  try {
    const { id, reference, is_duplicate } = await submitCustomerInquiry(validated.data);
    return Response.json({ success: true, id, reference, is_duplicate }, { status: 201 });
  } catch {
    return Response.json({ success: false, error: "We could not confirm your inquiry. Please retry to confirm it without submitting twice." }, { status: 500 });
  }
}
