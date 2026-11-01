import { renderToReadableStream } from "react-dom/server";

// Use React's streaming server renderer for async request-locale components.
// String rendering cannot resolve async Server Components or Suspense.
export async function renderAsyncMarkup(element) {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  // React inserts empty comment boundaries between adjacent dynamic text.
  // Normalize those boundaries for existing semantic HTML/text assertions.
  return (await new Response(stream).text()).replaceAll("<!-- -->", "");
}
