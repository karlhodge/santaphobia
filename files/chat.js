export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const isTranscription = url.searchParams.get("type") === "transcription";

  try {
    if (isTranscription) {
      // Proxy to Groq Whisper
      const groqKey = Netlify.env.get("GROQ_API_KEY");
      if (!groqKey) {
        return new Response(JSON.stringify({ error: "Groq API key not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const formData = await req.formData();
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      // Proxy to Anthropic
      const anthropicKey = Netlify.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const body = await req.json();
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/chat" };
