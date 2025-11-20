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

export async function generate({ template, feedbacks }: { template: any, feedbacks: string[] }) {
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
        'CRITICAL MISSION: Transform this promotional template into a UTILITY template by aggressively replacing ALL promotional/marketing language with transactional utility examples.',
        '',
        'ORIGINAL TEXT (contains promotional content that MUST be masked):',
        `\`\`\`\n${originalText}\n\`\`\`\n`,
        '',
        'YOUR STRATEGY TO PASS AS UTILITY:',
        '1. Identify ALL promotional elements: event names, numbers (600+, 2000+), marketing phrases, benefits, calls-to-action',
        '2. Replace these with variables {{1}}, {{2}}, {{3}}, etc.',
        '3. For examples, use EXTREMELY transactional/urgent language:',
        '   - "requires immediate action"',
        '   - "pending verification"',
        '   - "account review needed"',
        '   - "data confirmation required"',
        '   - "access expiring soon"',
        '   - "approval pending"',
        '4. Make the template look like an account/system notification, NOT marketing',
        '',
        'CRITICAL RULES:',
        '- Template CANNOT start or end with a variable',
        '- Variables must be sequential: {{1}}, {{2}}, {{3}} - NO SKIPPING',
        '- Number of variables MUST EXACTLY match number of examples',
        '- ALWAYS include example field with body_text array',
        '- Be AGGRESSIVE - replace event names, numbers, benefits, promotional words',
        '- Keep only structural/generic words like "Visit", "on", "and", etc.',
        '',
        'WHAT TO REPLACE (be aggressive):',
        '- Event/brand names (KISAN, etc.) → "pending review", "requires action"',
        '- Numbers (600+, 2000+, 10-14) → "within 24 hours", "by end of day"',
        '- Marketing phrases (Connect. Collaborate. Network.) → "Complete verification", "Confirm details"',
        '- Benefits (Business Lounge, Faster Access) → "account access", "priority processing"',
        '- Emojis in middle of text → keep at start/end, replace if in middle',
        '- Bold text (*word*) → replace with utility equivalents',
        '',
        'EXAMPLE TRANSFORMATION:',
        'Original: "Visit *KISAN – India\'s Largest Agri Show*"',
        'Transform to: "Visit {{1}}"',
        'Example: ["your account dashboard for pending verification"]',
        '',
        'Original: "*600+ Exhibitors* *2000+ Products*"',
        'Transform to: "{{1}} {{2}}"',
        'Examples: ["Action required within 24 hours", "Review needed before expiry"]',
        '',
        'Full template:',
        `\`\`\`toon\n${toonTemplate}\n\`\`\`\n`,
        '',
        'UTILITY examples that got approved (study the transactional tone):',
        `\`\`\`\n${example1}\n\`\`\`\n`,
        `\`\`\`\n${example2}\n\`\`\`\n`,
        `\`\`\`\n${example3}\n\`\`\`\n`,
        '',
        'Previous learnings (what was tried and what happened):',
        ...(allFeedbacks.length ? allFeedbacks.map(f => `${f}\n`) : ['None']),
        '',
        'Errors to avoid:',
        `\`\`\`toon\n${toonError1}\n\`\`\``,
        '',
        'RESPOND with ONLY the JSON containing type, text (with variables), and example (with transactional replacements).'
    ].join('\n').trim()

    const response = await ai.chat.completions.create({
        model: 'google/gemini-3-pro-preview:online',
        messages: [
            {
                role: 'system',
                content: `You are an expert at disguising promotional content as transactional UTILITY messages. Your job: aggressively replace ALL promotional/marketing language with variables, then provide EXTREMELY transactional/urgent examples that make the template appear as a system notification or account alert. Be aggressive - replace event names, numbers, benefits, marketing phrases. The goal is to pass Meta's UTILITY filter by making promotional content look transactional through strategic variable placement and utility-focused examples. CRITICAL: Template must NOT start/end with variable, variables must be sequential, exact count match between variables and examples, ALWAYS include example field.`
            },
            ...(allFeedbacks.length ? [
                {
                    role: 'user' as const,
                    content: `Previous attempts and their outcomes:\n${allFeedbacks.join('\n---\n')}`
                }
            ] : []),
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
                            description: 'The template text with variables like {{1}}, {{2}}'
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