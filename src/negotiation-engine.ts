import Groq from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';
import type { Case, Resource, Bid, Allocation, ResourceDependency } from './types';

// ── Data-driven dependency check ──────────────────────────────
function checkResourceDependencies(
  resource: Resource,
  allResources: Resource[],
  dependencies: ResourceDependency[]
): boolean {
  const deps = dependencies.filter(d => d.resource_id === resource.id);
  if (deps.length === 0) return true;

  for (const dep of deps) {
    const depResource = allResources.find(r => r.id === dep.depends_on_resource_id);
    if (!depResource) return false;
    if (depResource.status !== 'available') return false;
  }
  return true;
}

// ── Fallback data (when APIs are unreachable) ─────────────────
function getFallbackData(
  cases: Case[],
  resources: Resource[],
  roundId?: string
): { bids: Bid[]; allocations: Allocation[]; explanation: string } {
  const availableResources = resources.filter(r => r.status === 'available');
  const bids: Bid[] = [];
  const allocations: Allocation[] = [];
  const assignedCases = new Set<string>();
  const assignedResources = new Set<string>();

  // Sort cases by acuity (highest first) — allocate most critical first
  const sortedCases = [...cases].sort((a, b) => b.acuity_score - a.acuity_score);

  for (const c of sortedCases) {
    for (const r of availableResources) {
      if (assignedCases.has(c.id) || assignedResources.has(r.id)) continue;
      if (c.required_resource_types.includes(r.type)) {
        bids.push({
          id: '',
          hospital_id: '',
          round_id: roundId || 'demo_round',
          case_id: c.id,
          resource_id: r.id,
          bid_score: c.acuity_score * 10 + Math.random() * 5,
          reasoning: `Fallback match: ${r.type} (${r.label}) satisfies case acuity ${c.acuity_score} needing ${c.required_resource_types.join(', ')}`,
          conditions: [],
          created_at: new Date().toISOString(),
        });
        allocations.push({
          id: '',
          hospital_id: '',
          case_id: c.id,
          resource_id: r.id,
          round_id: roundId || '',
          explanation: '',
          approval_status: 'pending' as const,
          created_at: new Date().toISOString(),
        });
        assignedCases.add(c.id);
        assignedResources.add(r.id);
        break;
      }
    }
  }

  const allocCount = allocations.length;
  const explanation = allocCount > 0
    ? `Emergency fallback: ${allocCount} allocation(s) made. ${allocations.map(a => {
        const res = availableResources.find(r => r.id === a.resource_id);
        const cas = cases.find(c => c.id === a.case_id);
        return `${res?.type} (${res?.label}) → case acuity ${cas?.acuity_score}`;
      }).join('; ')}. For full AI analysis, configure Groq and Mistral API keys in Settings.`
    : 'Emergency fallback: no matching resources found for pending cases. Add available resources or configure API keys in Settings for AI-powered allocation.';

  return { bids, allocations, explanation };
}

// ── Convert our Case → engine-friendly shape for the LLM prompt ──
function caseForLLM(c: Case): Record<string, unknown> {
  return {
    id: c.id,
    acuity_score: c.acuity_score,
    status: c.status,
    required_resource_types: c.required_resource_types,
  };
}

function resourceForLLM(r: Resource): Record<string, unknown> {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    department: r.department,
    label: r.label,
  };
}

// ── Main negotiation round ────────────────────────────────────
export interface NegotiationResult {
  bids: Bid[];
  allocations: Allocation[];
  explanation: string;
}

export interface LlmKeys {
  groqKey: string;
  mistralKey: string;
}

export async function runNegotiationRound(
  cases: Case[],
  resources: Resource[],
  dependencies: ResourceDependency[],
  onBid?: (bid: Bid) => void,
  roundId?: string,
  llmKeys?: LlmKeys
): Promise<NegotiationResult> {
  const validCases = cases.filter(c => c.status === 'pending');
  if (validCases.length === 0) {
    return { bids: [], allocations: [], explanation: 'No pending cases to allocate.' };
  }

  // Resolve keys: use llmKeys if provided, otherwise fall back to env
  const groqApiKey = llmKeys?.groqKey || process.env.GROQ_API_KEY;
  const mistralApiKey = llmKeys?.mistralKey || process.env.MISTRAL_API_KEY;
  const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
  const mistralClient = mistralApiKey ? new Mistral({ apiKey: mistralApiKey }) : null;

  // If no Groq key at all, skip straight to fallback
  if (!groqClient) {
    console.warn('[Engine] No GROQ_API_KEY — using fallback');
    return getFallbackData(validCases, resources, roundId);
  }

  try {
    // 1. CONCURRENT BIDDING — filter by data-driven dependencies
    const bidPromises = resources.map(res => {
      if (res.status !== 'available') return Promise.resolve([]);
      if (!checkResourceDependencies(res, resources, dependencies)) {
        console.warn(`[Engine] Excluding resource ${res.id} (${res.type}) — unmet dependencies`);
        return Promise.resolve([]);
      }
      return evaluateSingleResource(res, validCases, groqClient, onBid, roundId);
    });

    const results = await Promise.all(bidPromises);
    const allBids: Bid[] = results.flat();

    // 2. CONFLICT RESOLUTION — greedy, highest bid_score wins
    const allocations: Allocation[] = [];
    const assignedCases = new Set<string>();
    const assignedResources = new Set<string>();

    allBids.sort((a, b) => b.bid_score - a.bid_score);

    for (const bid of allBids) {
      if (!assignedCases.has(bid.case_id) && !assignedResources.has(bid.resource_id)) {
        allocations.push({
          id: '',
          hospital_id: '',
          case_id: bid.case_id,
          resource_id: bid.resource_id,
          round_id: roundId || '',
          explanation: '',
          approval_status: 'pending' as const,
          created_at: new Date().toISOString(),
        });
        assignedCases.add(bid.case_id);
        assignedResources.add(bid.resource_id);
      }
    }

    // 3. EXPLANATION via Mistral (non-blocking if it fails)
    let explanationText = 'Allocations processed successfully.';
    if (mistralClient) {
      try {
        const allocDetails = allocations.map(a => {
          const matchedCase = validCases.find(c => c.id === a.case_id);
          const matchedRes = resources.find(r => r.id === a.resource_id);
          return {
            case_id: a.case_id,
            case_acuity: matchedCase?.acuity_score,
            case_types: matchedCase?.required_resource_types,
            resource_id: a.resource_id,
            resource_type: matchedRes?.type,
            resource_label: matchedRes?.label,
            resource_department: matchedRes?.department,
          };
        });
        const bidDetails = allBids.map(b => {
          const matchedCase = validCases.find(c => c.id === b.case_id);
          return {
            case_acuity: matchedCase?.acuity_score,
            case_types: matchedCase?.required_resource_types,
            resource_id: b.resource_id,
            bid_score: b.bid_score,
            reasoning: b.reasoning,
          };
        });
        const prompt = `You are a hospital emergency coordinator AI. Explain the following resource allocation decisions to hospital administrators.\n\nAllocated:\n${JSON.stringify(allocDetails, null, 2)}\n\nBid scores:\n${JSON.stringify(bidDetails, null, 2)}\n\nWrite a concise 2-3 sentence explanation. Mention specific cases (acuity level, resource type needed) and why each resource was matched. Be direct and professional.`;
        const response = await mistralClient.chat.complete({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: prompt }],
        });
        explanationText = (response.choices?.[0]?.message?.content as string) || explanationText;
      } catch (err) {
        console.warn('[Engine] Mistral explanation failed, using default:', err);
      }
    }

    return { bids: allBids, allocations, explanation: explanationText };

  } catch (error) {
    console.error('[Engine] Fatal error, triggering fallback:', error);
    return getFallbackData(validCases, resources, roundId);
  }
}

// ── Single resource agent via Groq ────────────────────────────
async function evaluateSingleResource(
  resource: Resource,
  cases: Case[],
  groqClient: Groq | null,
  onBid?: (bid: Bid) => void,
  roundId?: string
): Promise<Bid[]> {
  if (!groqClient) return [];

  const systemPrompt = `You are an autonomous agent managing a hospital resource: ${JSON.stringify(resourceForLLM(resource))}. Evaluate the pending cases and decide which one you want to bid on.`;
  const userMessage = `Pending Cases: ${JSON.stringify(cases.map(caseForLLM))}`;

  try {
    const response = await groqClient.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'submit_bids',
          description: 'Submit bids for cases you can handle',
          parameters: {
            type: 'object',
            properties: {
              bids: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    case_id: { type: 'string' },
                    resource_id: { type: 'string' },
                    bid_score: { type: 'number' },
                    reasoning: { type: 'string' },
                    conditions: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['case_id', 'resource_id', 'bid_score', 'reasoning', 'conditions'],
                },
              },
            },
            required: ['bids'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'submit_bids' } },
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return [];

    const args = JSON.parse(toolCalls[0].function.arguments);
    const validBids: Bid[] = (args.bids || []).map((b: any) => ({
      id: '',
      hospital_id: '',
      round_id: roundId || '',
      case_id: b.case_id,
      resource_id: resource.id,
      bid_score: b.bid_score,
      reasoning: b.reasoning,
      conditions: b.conditions || [],
      created_at: new Date().toISOString(),
    }));

    for (const bid of validBids) {
      if (onBid) onBid(bid);
    }

    return validBids;
  } catch (error) {
    console.warn(`[Engine] Agent error on ${resource.id}:`, error);
    return [];
  }
}
