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
// Includes starvation prevention: pending cases get a priority boost over time
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

  // Starvation prevention: boost priority for cases pending > 30s
  const now = Date.now();
  const scoredCases = cases.map(c => {
    const ageMs = now - new Date(c.created_at).getTime();
    const ageBoost = Math.min(0.3, ageMs / 300000); // up to +0.3 over 5 minutes
    const basePriority = ((c.acuity_score - 1) / 4) * 0.7 + 0.1; // 0.1-0.8 based on acuity
    return { case: c, priority: Math.min(1, basePriority + ageBoost) };
  }).sort((a, b) => b.priority - a.priority);

  for (const { case: c, priority } of scoredCases) {
    for (const r of availableResources) {
      if (assignedCases.has(c.id) || assignedResources.has(r.id)) continue;
      const effectiveTypes = c.required_resource_types.length > 0
        ? c.required_resource_types
        : c.suggested_resource_types;
      if (effectiveTypes.includes(r.type)) {
        const clinicalContext = c.symptoms
          ? ` [Patient: ${c.symptoms}]`
          : '';
        bids.push({
          id: '',
          hospital_id: '',
          round_id: roundId || 'demo_round',
          case_id: c.id,
          resource_id: r.id,
          bid_score: Math.min(1, Math.max(0, priority + Math.random() * 0.05)),
          reasoning: `Fallback match: ${r.type} (${r.label}) for priority ${priority.toFixed(2)}${clinicalContext}`,
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
        const clinical = cas?.symptoms ? ` — ${cas.symptoms}` : '';
        return `${res?.type} (${res?.label}) → acuity ${cas?.acuity_score}${clinical}`;
      }).join('; ')}. For full AI analysis, configure Groq and Mistral API keys in Settings.`
    : 'Emergency fallback: no matching resources found for pending cases. Add available resources or configure API keys in Settings for AI-powered allocation.';

  return { bids, allocations, explanation };
}

// ── Convert our Case → engine-friendly shape for the LLM prompt ──
function caseForLLM(c: Case): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: c.id,
    acuity_score: c.acuity_score,
    status: c.status,
    required_resource_types: c.required_resource_types,
  };

  // Include clinical data when available
  if (c.symptoms) result.symptoms = c.symptoms;
  if (c.symptom_severity) result.symptom_severity = c.symptom_severity;
  if (c.triage_note) result.triage_note = c.triage_note;
  if (c.suggested_resource_types?.length) result.suggested_resource_types = c.suggested_resource_types;

  // Include vital signs if present
  if (c.vital_signs && typeof c.vital_signs === 'object') {
    const vitals = c.vital_signs as Record<string, unknown>;
    if (Object.keys(vitals).length > 0) result.vital_signs = vitals;
  }

  return result;
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
            case_symptoms: matchedCase?.symptoms || undefined,
            case_triage_note: matchedCase?.triage_note || undefined,
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
            case_symptoms: matchedCase?.symptoms || undefined,
            resource_id: b.resource_id,
            bid_score: b.bid_score,
            reasoning: b.reasoning,
          };
        });
        const prompt = `You are a hospital emergency coordinator AI. Explain the following resource allocation decisions to hospital administrators.

Allocated:
${JSON.stringify(allocDetails, null, 2)}

Bid scores:
${JSON.stringify(bidDetails, null, 2)}

Write a concise 2-3 sentence explanation. Mention specific cases (acuity level, symptoms, resource type needed) and why each resource was matched. Be direct and professional. Reference clinical details when available.`;
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

  const resourceShape = resourceForLLM(resource);
  const systemPrompt = `You are an autonomous agent managing a hospital resource: ${JSON.stringify(resourceShape)}.

Your job is to evaluate pending emergency cases and decide which ones you can best serve with this resource.

When evaluating cases, consider:
- Clinical urgency: Higher acuity scores (5=critical, 1=minor) indicate more urgent need
- Required vs suggested resource types: Prioritize cases that explicitly need your resource type
- Vital signs: Abnormal vitals (high HR, low SpO2, abnormal BP) indicate sicker patients
- Triage notes: Clinical context helps you understand the full picture
- FAIRNESS: If a case has been pending longer, it deserves higher priority to prevent starvation

IMPORTANT RULES:
1. The bid_score MUST be between 0.0 and 1.0 (inclusive).
   - 1.0 = highest urgency, perfect resource match
   - 0.0 = no urgency, poor match
2. You may bid on MULTIPLE cases (not just one). Evaluate each case independently.
3. For each case, decide: should I allocate this resource to this case? If yes, bid.
4. Never bid on the same case with different resource_id values in one response.`;
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
      bid_score: Math.min(1, Math.max(0, Number(b.bid_score) || 0)),
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
