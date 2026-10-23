// WSLR Kitchen: read-product
// Reads a photo of one product (a tray of lasagne, a tub of ice cream, a
// carton of milk) and returns what the Add item form needs, so nobody has to
// type it: name, brand, pack size, how many, the use by or best before date,
// category and where it is stored.
//
// Needs the ANTHROPIC_API_KEY secret (Supabase dashboard, Edge Functions,
// Secrets). The function says so plainly if it is missing.
import Anthropic from "npm:@anthropic-ai/sdk";

const PUBLISHABLE_KEY = "sb_publishable_G5ZTmaaLwa8qbkFMBmUCeQ_sJs753qH";
const MODEL = "claude-opus-5-5";
const STORAGES = ["fridge", "freezer", "dry", "kitchen_fridge"];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
function schema(categories: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "brand", "size", "quantity", "unit", "date", "date_type", "category", "storage"],
    properties: {
      name: { type: "string" },
      brand: nullable({ type: "string" }),
      size: nullable({ type: "string" }),
      quantity: nullable({ type: "number" }),
      unit: nullable({ type: "string" }),
      date: nullable({ type: "string" }),
      date_type: nullable({ type: "string", enum: ["use_by", "best_before"] }),
      category: categories.length ? nullable({ type: "string", enum: categories }) : { type: "null" },
      storage: nullable({ type: "string", enum: STORAGES }),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (req.headers.get("apikey") !== PUBLISHABLE_KEY) return json({ error: "Not authorised" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return json({ error: "The photo reader is not set up yet: add the ANTHROPIC_API_KEY secret in Supabase (Edge Functions, Secrets)." }, 500);
  }

  let body: { files?: { media_type?: string; data_b64: string }[]; categories?: string[]; today?: string };
  try { body = await req.json(); } catch { return json({ error: "Send the photo as JSON" }, 400); }
  const files = Array.isArray(body.files) ? body.files.slice(0, 3) : [];
  if (!files.length) return json({ error: "No photo provided" }, 400);
  const categories = (Array.isArray(body.categories) ? body.categories : []).filter((c) => typeof c === "string" && c).slice(0, 60);
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  const blocks = files.map((f) =>
    f.media_type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data_b64 } }
      : { type: "image", source: { type: "base64", media_type: f.media_type || "image/jpeg", data: f.data_b64 } }
  );
  const prompt =
    "This is a photo taken in a commercial kitchen at a holiday park in Australia of one product that is going into stock. " +
    "Read the packaging and label and fill in the fields.\n" +
    "- name: what a cook would call it, short and in normal word order, e.g. \"Chocolate cake\" or \"Beef lasagne\". Leave the brand out of the name.\n" +
    "- brand: the brand or maker if printed, otherwise null.\n" +
    "- size: the pack size as printed, e.g. \"1 kg\", \"2 L\", \"12 pack\", otherwise null.\n" +
    "- quantity and unit: how many of these are in the photo and what one is, e.g. 1 and \"tray\", 3 and \"tub\". Use 1 if only one is visible.\n" +
    "- date and date_type: the use by or best before date printed on it as YYYY-MM-DD, and which kind it is. " +
    "If only a day and month are printed, use the next date on or after today, " + today + ". " +
    "\"Use by\", \"UB\" and \"Expiry\" mean use_by; \"Best before\", \"BB\" and \"Best by\" mean best_before. " +
    "If no date can be read clearly, both are null. Never guess a date.\n" +
    "- category: the closest category from the allowed list, or null.\n" +
    "- storage: where it should be kept: fridge (the cool room) for chilled food, freezer for frozen food, dry for shelf-stable food, " +
    "kitchen_fridge only if the label suggests a small chilled item for the kitchen fridges. Null if unsure.\n" +
    "Leave any field you cannot read with confidence as null rather than guessing.";

  const client = new Anthropic();
  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: schema(categories) } },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: prompt }] }],
    };
    const response = await client.beta.messages.create(params);
    if (response.stop_reason === "refusal") {
      return json({ error: "The photo could not be read. Try another photo, or fill the item in by hand." }, 422);
    }
    const text = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { type: string; text?: string }) => b.text || "")
      .join("");
    const data = JSON.parse(text);
    if (data.storage && !STORAGES.includes(data.storage)) data.storage = null;
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { data.date = null; data.date_type = null; }
    return json(data);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "The photo reader is busy. Try again in a minute." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "The photo reader's API key was not accepted. Check the ANTHROPIC_API_KEY secret in Supabase." }, 500);
    if (e instanceof Anthropic.BadRequestError) return json({ error: "The photo could not be sent: " + e.message }, 400);
    if (e instanceof Anthropic.APIError) return json({ error: "The photo reader had a problem (" + e.status + "). Try again." }, 502);
    if (e instanceof SyntaxError) return json({ error: "The photo could not be read clearly. Try another photo." }, 422);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
