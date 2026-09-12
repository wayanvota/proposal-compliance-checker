import http from "node:http";

const port = Number(process.env.PORT || 9011);

function completion(content) {
  return {
    id: "chatcmpl-e2e-fixture",
    object: "chat.completion",
    created: 0,
    model: "fixture",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  };
}

function responseFor(prompt) {
  if (prompt.includes("UPSTREAM_FAILURE")) return { status: 500, body: { error: { message: "fixture upstream failure" } } };
  if (prompt.includes("MALFORMED_MODEL_OUTPUT")) return { status: 200, body: completion("not-json") };

  if (prompt.includes("Extract every compliance")) {
    return {
      status: 200,
      body: completion(JSON.stringify({
        requirements: [
          {
            id: "R1",
            section: "Project Narrative",
            requirement: "Include a dissemination plan.",
            citation: "Project Narrative must include a dissemination plan.",
            category: "narrative"
          },
          {
            id: "R2",
            section: "Budget",
            requirement: "Budget may not exceed $100,000.",
            citation: "Total budget must not exceed $100,000.",
            category: "budget"
          },
          {
            id: "R3",
            section: "Attachments",
            requirement: "Attach current resumes.",
            citation: "Applicants must attach current resumes.",
            category: "attachment"
          }
        ]
      }))
    };
  }

  if (prompt.includes("INVALID_MODEL_STATUS")) {
    return {
      status: 200,
      body: completion(JSON.stringify({ findings: [{
        requirementId: "R1",
        requirement: "Include a dissemination plan.",
        status: "WINNER",
        evidence: "Invalid fixture value.",
        citedRequirement: "Project Narrative must include a dissemination plan."
      }] }))
    };
  }

  const findings = [];
  if (prompt.includes('"id": "R1"')) {
    const hasPlan = /Proposal section:[\s\S]*dissemination plan/i.test(prompt);
    findings.push({
      requirementId: "R1",
      requirement: "Include a dissemination plan.",
      status: hasPlan ? "PRESENT" : "MISSING",
      evidence: hasPlan ? "The draft includes a dissemination plan." : "No dissemination plan is present.",
      citedRequirement: "Project Narrative must include a dissemination plan."
    });
  }
  if (prompt.includes('"id": "R2"')) {
    const overLimit = /Proposal section:[\s\S]*(?:\$120,000|120000)/i.test(prompt);
    findings.push({
      requirementId: "R2",
      requirement: "Budget may not exceed $100,000.",
      status: overLimit ? "NON_COMPLIANT" : "PRESENT",
      evidence: overLimit ? "The draft requests $120,000." : "The stated request does not exceed $100,000.",
      citedRequirement: "Total budget must not exceed $100,000."
    });
  }
  if (prompt.includes('"id": "R3"')) {
    findings.push({
      requirementId: "R3",
      requirement: "Attach current resumes.",
      status: "NEEDS_HUMAN_REVIEW",
      evidence: prompt.includes("<img src=x") ? "<img src=x onerror=window.__pwned=true>" : "Attachments cannot be verified from pasted text.",
      citedRequirement: "Applicants must attach current resumes.",
      humanReviewNote: "Confirm the final upload package."
    });
  }
  return { status: 200, body: completion(JSON.stringify({ findings })) };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end('{"ok":true}');
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404, { "content-type": "application/json" });
    return response.end('{"error":{"message":"not found"}}');
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const prompt = (payload.messages || []).map((message) => message.content || "").join("\n");
  const fixture = responseFor(prompt);
  response.writeHead(fixture.status, { "content-type": "application/json" });
  response.end(JSON.stringify(fixture.body));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OpenAI E2E fixture listening on 127.0.0.1:${port}`);
});
