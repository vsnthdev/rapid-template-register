import OpenAI from 'openai'
import { encode } from '@toon-format/toon'
import path from 'path'

const ai = new OpenAI({
    apiKey: process.env.OPENROUTER_TOKEN,
    baseURL: 'https://openrouter.ai/api/v1',
})

const example1 = `Hi Rahul,

This message is being sent in response to your property inquiry for 3 BHK Flat in Stage 2nd BTM Layout, Bangalore.

We have added a few listings that match the information you submitted.

You can view them using the button below.`

const example2 = `Hi

You have a request from Devisha Associates (Agent) for the Bangalore listing that requires your review.

Property 1 in 10:
Rs. 58,000 | 2 BHK Flat | 1200 sq ft
Rich Homes Apartment | Poss. By Nov '25
Sector 2 HSR Layout, Bangalore

Please review the request by selecting the option below.`

const example3 = `Hi rahul,

This message is being sent in response to your property inquiry for 2 BHK Flat in Begur Road, Bangalore.

We have added a few listings that match the information you submitted.

You can view them using the button below.

You have a request from Devisha Associates (Agent) for the Bangalore listing that requires your review.`

const error1 = {
    'error': {
        'message': 'Invalid parameter',
        'type': 'OAuthException',
        'code': 100,
        'error_subcode': 2388293,
        'is_transient': false,
        'error_user_title': 'Parameters words ratio exceeds limit',
        'error_user_msg': 'This template has too many variables for its length. Reduce the number of variables or increase the message length.',
        'fbtrace_id': 'Ao_TWfjawkYHlwn6fA2B5Lp'
    }
}

interface Learning {
    generatedBody: any
    apiResponse: string
    timestamp: string
}

async function loadLearnings(): Promise<Learning[]> {
    const learningsPath = path.join(process.cwd(), 'learnings.json')
    try {
        const file = Bun.file(learningsPath)
        if (await file.exists()) {
            const data = await file.json()
            return data.learnings || []
        }
    } catch (error) {
        // file doesn't exist or is invalid, return empty
    }
    return []
}

async function saveLearning(generatedBody: any, apiResponse: any) {
    const learningsPath = path.join(process.cwd(), 'learnings.json')
    const existingLearnings = await loadLearnings()
    
    const apiResponseStr = JSON.stringify(apiResponse)
    const generatedBodyStr = JSON.stringify(generatedBody)
    
    // check if this exact combination already exists
    const isDuplicate = existingLearnings.some(learning => 
        JSON.stringify(learning.generatedBody) === generatedBodyStr &&
        learning.apiResponse === apiResponseStr
    )
    
    if (!isDuplicate) {
        const newLearning: Learning = {
            generatedBody,
            apiResponse: apiResponseStr,
            timestamp: new Date().toISOString()
        }
        
        existingLearnings.push(newLearning)
        await Bun.write(learningsPath, JSON.stringify({ learnings: existingLearnings }, null, 2))
    }
}

function formatLearningsForPrompt(learnings: Learning[]): string[] {
    return learnings.map((learning, index) => {
        const response = JSON.parse(learning.apiResponse)
        let summary = `Attempt ${index + 1} (${learning.timestamp}):\n`
        summary += `Generated: ${JSON.stringify(learning.generatedBody)}\n`
        
        if (response.error) {
            summary += `Error: ${response.error.error_user_msg || response.error.message}`
        } else if (response.category) {
            summary += `Result: Category=${response.category}, Status=${response.status || 'N/A'}`
        } else {
            summary += `Result: ${JSON.stringify(response)}`
        }
        
        return summary
    })
}

export async function generateModified({ template, feedbacks }: { template: any, feedbacks: string[] }) {
    const toonTemplate = encode(template, {
        indent: 4
    })
    const toonError1 = encode(error1, {
        indent: 4
    })

    // extract original body text
    const originalBody = template.components.find((comp: any) => comp.type == 'BODY')
    const originalText = originalBody?.text || ''

    // load persistent learnings
    const persistentLearnings = await loadLearnings()
    const formattedLearnings = formatLearningsForPrompt(persistentLearnings)
    
    // combine formatted learnings with current feedbacks
    const allFeedbacks = [...formattedLearnings, ...feedbacks]

    const content = [
        'CRITICAL MISSION: You MUST preserve the EXACT structure and flow of the original text. Only replace specific promotional words/phrases with variables {{1}}, {{2}}, etc. DO NOT change the sentence structure, emojis, formatting, or overall content flow.',
        '',
        'ORIGINAL TEXT (MUST be preserved exactly, only replace specific words):',
        `\`\`\`\n${originalText}\n\`\`\`\n`,
        '',
        'STRICT RULES FOR VARIABLE REPLACEMENT:',
        '1. Keep ALL emojis in their EXACT positions (🌾, 🤝, 🚜, ⛺, 🗓️, 📍, 👇)',
        '2. Keep ALL formatting (*bold text*, line breaks, bullet points) EXACTLY as is',
        '3. Keep ALL structural words (Want to, Visit, Unlock, and much more, etc.)',
        '4. ONLY replace specific promotional content with variables:',
        '   - Event/brand names: "KISAN – India\'s Largest Agri Show" → {{1}}',
        '   - Numbers: "600+ Exhibitors" → {{2}}, "2000+ Products" → {{3}}, "10+ Specialized Pavilions" → {{4}}',
        '   - Marketing phrases: "Connect. Collaborate. Network." → {{5}}',
        '   - Benefits: "Dedicated Business Lounge" → {{6}}, "Faster Access" → {{7}}, etc.',
        '   - Dates: "10–14" → {{8}}',
        '   - Location: "PIECC, Moshi, Pune" → {{9}}',
        '',
        'EXAMPLE TRANSFORMATION (keep structure identical):',
        'Original: "🌾 Want to connect with leaders in agriculture?\\n\\nVisit *KISAN – India\'s Largest Agri Show*"',
        'Transform: "🌾 Want to connect with leaders in agriculture?\\n\\nVisit *{{1}}*"',
        'Example: ["your account dashboard for pending verification"]',
        '',
        'CRITICAL: When variables are replaced with examples, it MUST reconstruct the EXACT original text character-by-character.',
        '',
        'Template structure:',
        `\`\`\`toon\n${toonTemplate}\n\`\`\`\n`,
        '',
        'Previous attempts and feedback:',
        ...(allFeedbacks.length ? allFeedbacks.map(f => `${f}\n`) : ['None']),
        '',
        'RESPOND with ONLY the JSON containing type, text (with strategic variable replacements), and example (with utility-focused values that reconstruct the original).'
    ].join('\n').trim()

    const response = await ai.chat.completions.create({
        model: 'google/gemini-3-pro-preview:online',
        messages: [
            {
                role: 'system',
                content: `You are a precision text processor. Your ONLY job is to strategically replace specific promotional words/phrases in the original text with variables {{1}}, {{2}}, etc., while preserving the EXACT structure, formatting, emojis, and flow. DO NOT change sentence structure or rewrite content. Only replace specific promotional elements with variables, then provide utility-focused example values that when substituted back will reconstruct the original text EXACTLY. CRITICAL: The reconstructed text must match the original character-by-character.`
            },
            {
                content,
                role: 'user',
            }
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'template_body',
                strict: true,
                schema: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            description: 'The type of template component'
                        },
                        text: {
                            type: 'string',
                            description: 'The template text with strategic variable replacements'
                        },
                        example: {
                            type: 'object',
                            properties: {
                                body_text: {
                                    type: 'array',
                                    description: 'Array of example values for each variable',
                                    items: {
                                        type: 'array',
                                        items: {
                                            type: 'string'
                                        }
                                    }
                                }
                            },
                            required: ['body_text'],
                            additionalProperties: false
                        }
                    },
                    required: ['type', 'text', 'example'],
                    additionalProperties: false
                }
            }
        }
    })

    const generatedBody = JSON.parse(response.choices[0]!.message.content!)
    
    return { generatedBody, saveLearning }
}

export { saveLearning }