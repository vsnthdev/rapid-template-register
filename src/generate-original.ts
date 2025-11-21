import OpenAI from 'openai'

const ai = new OpenAI({
    apiKey: process.env.OPENROUTER_TOKEN,
    baseURL: 'https://openrouter.ai/api/v1',
})

const utilityExamples = [
    `Hi,

Your account verification is pending review.

Please complete the verification process to maintain access to your services.

You can complete verification using the button below.`,

    `Hi,

You have a pending request that requires your immediate attention.

Request details:
Status: Pending Review
Priority: High
Action Required: Approval needed

Please review the request by selecting the option below.`,

    `Hi,

This message is regarding your recent service request.

We have processed your request and require additional information to proceed.

You can provide the required information using the button below.`
]

export async function generateOriginal({ template, feedbacks = [] }: { template: any, feedbacks?: string[] }) {
    // extract original body component
    const originalBody = template.components.find((comp: any) => comp.type == 'BODY')
    
    if (!originalBody) {
        throw new Error('No BODY component found in template')
    }

    const response = await ai.chat.completions.create({
        model: 'google/gemini-3-pro-preview:online',
        messages: [
            {
                role: 'system',
                content: `You are an expert at creating UTILITY WhatsApp templates that get approved by Meta. Create completely new content that is transactional, urgent, and utility-focused. DO NOT use variables - create organic utility content that naturally passes Meta's filters. Focus on account notifications, service updates, verification requests, or system alerts.`
            },
            ...(feedbacks.length ? [
                {
                    role: 'user' as const,
                    content: `Previous attempts and their outcomes:\n${feedbacks.join('\n---\n')}`
                }
            ] : []),
            {
                role: 'user',
                content: [
                    'Create a completely new UTILITY template content that will organically pass Meta approval.',
                    '',
                    'REQUIREMENTS:',
                    '- NO variables ({{1}}, {{2}}, etc.) - pure utility content',
                    '- Transactional/urgent tone (account alerts, verification, service updates)',
                    '- Professional and system-like messaging',
                    '- Should feel like an automated system notification',
                    '',
                    'UTILITY examples that got approved:',
                    ...utilityExamples.map(ex => `\`\`\`\n${ex}\n\`\`\``),
                    '',
                    'RESPOND with ONLY the JSON containing type and text (no variables).'
                ].join('\n')
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
                            description: 'The template text without any variables'
                        }
                    },
                    required: ['type', 'text'],
                    additionalProperties: false
                }
            }
        }
    })

    const generatedBody = JSON.parse(response.choices[0]!.message.content!)
    
    // ensure example field is removed if it exists
    if (generatedBody.example) {
        delete generatedBody.example
    }
    
    return { 
        generatedBody,
        saveLearning: async () => {} // no-op for this approach
    }
}

export { generateOriginal as generate }