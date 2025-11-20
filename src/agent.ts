import { generate } from './generate'
import { register } from './register'
import { getTemplateName } from './template-names'
import type { Label } from './select-label'

function reconstructOriginal(modifiedText: string, exampleValues: string[]): string {
    let reconstructed = modifiedText
    
    // replace each variable with its example value
    exampleValues.forEach((value, index) => {
        const variable = `{{${index + 1}}}`
        reconstructed = reconstructed.replace(variable, value)
    })
    
    return reconstructed
}

function extractVariableMapping(modifiedText: string, exampleValues: string[]): Record<string, string> {
    const mapping: Record<string, string> = {}
    
    exampleValues.forEach((value, index) => {
        mapping[`{{${index + 1}}}`] = value
    })
    
    return mapping
}

function findDifferences(original: string, reconstructed: string): string {
    if (original === reconstructed) return 'Texts match exactly'
    
    const maxLen = Math.max(original.length, reconstructed.length)
    let firstDiff = -1
    
    for (let i = 0; i < maxLen; i++) {
        if (original[i] !== reconstructed[i]) {
            firstDiff = i
            break
        }
    }
    
    const contextStart = Math.max(0, firstDiff - 20)
    const contextEnd = Math.min(maxLen, firstDiff + 20)
    
    return `First difference at position ${firstDiff}:\nOriginal: "${original.substring(contextStart, contextEnd)}"\nReconstructed: "${reconstructed.substring(contextStart, contextEnd)}"`
}

export async function agent(label: Label, template: any) {
    let stop = false
    const previousFeedback: string[] = []
    let iteration = 0
    const maxIterations = 10 // safety limit

    // get original body text
    const originalBody = template.components.find((comp: any) => comp.type == 'BODY')
    const originalText = originalBody?.text || ''

    while (stop == false && iteration < maxIterations) {
        iteration++
        console.log(`\n🔄 Iteration ${iteration}`)

        // generate modified body using AI
        const body = await generate({ template, feedbacks: previousFeedback })
        console.log(`✅ Generated modified template using AI`)

        // replace body component and assign new name
        const templateName = getTemplateName()
        const replaced = {
            ...template,
            components: template.components.map((comp: any) => comp.type == 'BODY' ? body : comp),
            name: templateName
        }
        console.log(`✅ Crafted replacement with name: ${replaced.name}`)

        // verify that reconstruction matches original
        const exampleValues = body.example?.body_text?.[0] || []
        const reconstructed = reconstructOriginal(body.text, exampleValues)
        const isExactMatch = reconstructed === originalText

        if (!isExactMatch) {
            const diff = findDifferences(originalText, reconstructed)
            console.log(`⚠️ Reconstructed text doesn't match original`)
            console.log(`   Original length: ${originalText.length}, Reconstructed length: ${reconstructed.length}`)
            console.log(`   ${diff}`)
            
            previousFeedback.push(`The variables you placed don't reconstruct the exact original text. ${diff}. You MUST ensure that when replacing {{1}}, {{2}}, etc. with the example values, it produces the EXACT original text character-by-character including all emojis, asterisks, newlines, and spaces. Do not modify, remove, or add any characters from the original.`)
            continue // skip registration, try again
        }

        console.log(`✅ Verified: Reconstruction matches original exactly`)

        // attempt registration
        const result = await register(label, replaced)

        // check if we got UTILITY + PENDING
        if (result && result.category == 'UTILITY' && result.status == 'PENDING') {
            console.log(`\n✅ Success! Template registered as UTILITY with PENDING status`)
            console.log(`Template ID: ${result.id}`)
            console.log(`Template Name: ${templateName}`)
            
            // display variable mapping
            const mapping = extractVariableMapping(body.text, exampleValues)
            
            if (Object.keys(mapping).length > 0) {
                console.log(`\n📝 Variable Mapping (use these original values when sending):`)
                Object.entries(mapping).forEach(([variable, value]) => {
                    console.log(`${variable} = ${value}`)
                })
            } else {
                console.log(`\n📝 No variables used - template registered as-is`)
            }
            
            stop = true
        } else if (result && result.error) {
            // registration failed, add error to feedback
            const errorMessage = result.error.error_user_msg || result.error.message || JSON.stringify(result.error)
            console.log(`❌ Registration failed: ${errorMessage}`)
            previousFeedback.push(`Registration attempt ${iteration} failed: ${errorMessage}`)
        } else if (result && result.category == 'MARKETING') {
            // got marketing category, add to feedback
            console.log(`❌ Got MARKETING category, retrying...`)
            previousFeedback.push(`Registration attempt ${iteration} was categorized as MARKETING instead of UTILITY`)
        } else if (result) {
            // other status, add to feedback
            console.log(`⚠️ Got category: ${result.category}, status: ${result.status}`)
            previousFeedback.push(`Registration attempt ${iteration} resulted in category: ${result.category}, status: ${result.status}`)
        }
    }

    if (iteration >= maxIterations) {
        console.log(`\n⚠️ Reached maximum iterations (${maxIterations}) without success`)
    }
}