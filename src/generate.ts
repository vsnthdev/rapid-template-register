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

async function loadLearnings(): Promise<string[]> {
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

async function saveLearnings(learnings: string[]) {
    const learningsPath = path.join(process.cwd(), 'learnings.json')
    await Bun.write(learningsPath, JSON.stringify({ learnings }, null, 2))
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
    
    // combine persistent learnings with current feedbacks
    const allFeedbacks = [...persistentLearnings, ...feedbacks]

    const content = [
        'CRITICAL INSTRUCTION: You must PRESERVE the EXACT original text. Do NOT rewrite, rephrase, or change ANY part of the text.',
        '',
        'Below is the ORIGINAL template text that you MUST preserve exactly:',
        `\`\`\`\n${originalText}\n\`\`\`\n`,
        'Your ONLY job is to:',
        '1. Take the EXACT text above',
        '2. Replace ONLY specific parts (emojis INSIDE the text, bold text with asterisks, promotional words) with variables {{1}}, {{2}}, etc.',
        '3. CRITICAL: The template MUST NOT start or end with a variable',
        '   - If the original starts with an emoji or special char, keep at least 1-2 regular words before placing first variable',
        '   - If the original ends with emoji or special char, keep at least 1-2 regular words after last variable',
        '   - Example: "🌾 Want to..." should become "Want to {{1}}..." NOT "{{1}} Want to..."',
        '4. Variables MUST be numbered sequentially starting from {{1}}, then {{2}}, {{3}}, etc. - NO SKIPPING NUMBERS',
        '5. The number of variables in your text MUST EXACTLY match the number of examples you provide',
        '6. Keep EVERYTHING else EXACTLY as it is - same words, same spacing, same newlines, same punctuation',
        '7. In the example.body_text array, provide EXACTLY one example value for each variable in sequential order',
        '8. When someone replaces {{1}} with example[0], {{2}} with example[1], etc., they must get back the EXACT original text',
        '9. ALWAYS provide the example field with body_text array - NEVER omit it',
        '',
        'CRITICAL VARIABLE RULES:',
        '- Template CANNOT start with {{1}} or end with {{N}} - this will cause rejection',
        '- If you use {{1}}, {{2}}, {{3}} in text, you MUST provide exactly 3 examples in body_text[0]',
        '- Variables must be sequential: {{1}}, {{2}}, {{3}} - NOT {{1}}, {{3}}, {{5}}',
        '- Do not use too many variables - keep it minimal (2-4 max)',
        '- Focus on replacing bold text (*word*), specific promotional phrases, not structural words',
        '',
        'Example of CORRECT variable usage:',
        'Original: "🌾 Want to connect with leaders?"',
        'WRONG: "{{1}} Want to connect with leaders?" ❌ (starts with variable)',
        'CORRECT: "Want to connect with {{1}}?" ✓ (variable in middle, keep "🌾 Want to connect with" as example)',
        'Examples: [["leaders in agriculture"]]',
        '',
        'Full template for context:',
        `\`\`\`toon\n${toonTemplate}\n\`\`\`\n`,
        '',
        'Strategy:',
        '- Replace bold text (text between asterisks like *KISAN*) with variables',
        '- Replace specific promotional words/phrases in the MIDDLE of sentences',
        '- Keep emojis at start/end as regular text, only replace if they are in the middle',
        '- Use transactional/utility examples like "requires your review", "data will be deleted", "action required"',
        '- Keep structural words, generic text, and formatting exactly as-is',
        '',
        'Previous feedback and learnings:',
        ...(allFeedbacks.length ? allFeedbacks.map(f => `- ${f}`) : ['None']),
        '',
        'Examples that got approved as UTILITY:',
        `\`\`\`example 1\n${example1}\n\`\`\`\n`,
        `\`\`\`example 2\n${example2}\n\`\`\`\n`,
        `\`\`\`example 3\n${example3}\n\`\`\`\n`,
        '',
        'Errors to avoid:',
        `\`\`\`toon\n${toonError1}\n\`\`\``,
        '',
        'Respond with ONLY the JSON structure for the BODY component with type, text, and example fields.'
    ].join('\n').trim()

    const response = await ai.chat.completions.create({
        model: 'google/gemini-3-pro-preview:online',
        messages: [
            {
                role: 'system',
                content: `You are a precision text processor. Your ONLY job is to strategically place variables in the EXACT original text without changing ANY other characters. CRITICAL RULES: 1) Template must NOT start or end with a variable, 2) Variables must be numbered sequentially ({{1}}, {{2}}, {{3}}), 3) You must provide EXACTLY the same number of examples as variables used, 4) ALWAYS include the example field with body_text array. You MUST preserve the original text exactly - every character, space, newline, emoji, and punctuation mark must remain in the same position.`
            },
            ...(allFeedbacks.length ? [
                {
                    role: 'user' as const,
                    content: `Previous attempts and learnings:\n${allFeedbacks.join('\n\n')}`
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

    // save new feedbacks to persistent learnings
    if (feedbacks.length > 0) {
        const updatedLearnings = [...persistentLearnings, ...feedbacks]
        await saveLearnings(updatedLearnings)
    }

    return JSON.parse(response.choices[0]!.message.content!)
}