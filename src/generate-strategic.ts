import OpenAI from 'openai'
import path from 'path'

const ai = new OpenAI({
    apiKey: process.env.OPENROUTER_TOKEN,
    baseURL: 'https://openrouter.ai/api/v1',
})

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

export async function generateStrategic({ template, feedbacks }: { template: any, feedbacks: string[] }) {
    // extract original body text
    const originalBody = template.components.find((comp: any) => comp.type == 'BODY')
    const originalText = originalBody?.text || ''

    // load persistent learnings
    const persistentLearnings = await loadLearnings()
    const formattedLearnings = formatLearningsForPrompt(persistentLearnings)
    
    // combine formatted learnings with current feedbacks
    const allFeedbacks = [...formattedLearnings, ...feedbacks]

    const content = [
        'STRATEGIC VARIABLE REPLACEMENT MISSION:',
        'Your goal is to make this template appear as UTILITY to Meta by strategically replacing SPECIFIC words/phrases with variables, NOT entire sentences.',
        '',
        'ORIGINAL TEXT (preserve structure, only replace specific words):',
        `\`\`\`\n${originalText}\n\`\`\`\n`,
        '',
        'STRATEGY:',
        '1. Identify specific promotional words/phrases to replace:',
        '   - Event/brand names (e.g., "CARE 2025", "KISAN")',
        '   - Specific numbers (e.g., "600+", "2000+")',
        '   - Marketing taglines (e.g., "Meet the Right People")',
        '   - Benefit descriptions (e.g., "Session schedules & alerts")',
        '',
        '2. Replace ONLY those specific words/phrases with variables {{1}}, {{2}}, etc.',
        '',
        '3. For examples, use BLAND TRANSACTIONAL/ALARMING phrases:',
        '   - "Review required"',
        '   - "Your account will be deleted"',
        '   - "Urgent message"',
        '   - "Please check immediately"',
        '   - "Order update"',
        '   - "Registration confirmation"',
        '   - "Action needed"',
        '   - "Verification pending"',
        '',
        'CRITICAL RULES:',
        '- Keep ALL sentence structure, emojis, formatting EXACTLY as is',
        '- Only replace specific words/phrases, NOT entire sentences',
        '- Template CANNOT start or end with a variable',
        '- Variables must be sequential: {{1}}, {{2}}, {{3}} - NO SKIPPING',
        '- Number of variables MUST EXACTLY match number of examples',
        '- Examples should be bland utility phrases that make it look transactional',
        '',
        'EXAMPLE TRANSFORMATION:',
        'Original: "👋 Hi! Welcome to *CARE 2025*!"',
        'Transform: "👋 Hi! Welcome to *{{1}}*!"',
        'Example: ["Review required"]',
        '',
        'Original: "✓ Session schedules & alerts"',
        'Transform: "✓ {{1}}"',
        'Example: ["Your account will be deleted"]',
        '',
        'Previous attempts and feedback:',
        ...(allFeedbacks.length ? allFeedbacks.map(f => `${f}\n`) : ['None']),
        '',
        'RESPOND with ONLY the JSON containing type, text (with strategic variable replacements), and example (with bland utility phrases).'
    ].join('\n').trim()

    const response = await ai.chat.completions.create({
        model: 'google/gemini-3-pro-preview:online',
        messages: [
            {
                role: 'system',
                content: `You are an expert at strategic variable placement. Your job: identify specific promotional words/phrases in the original text and replace ONLY those with variables. Then provide bland, transactional, alarming example values that make the template appear as a UTILITY notification to Meta. DO NOT replace entire sentences - only specific words/phrases. The goal is to preserve the original structure while making it look transactional through strategic word replacement.`
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
                                    description: 'Array of bland utility example values for each variable',
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