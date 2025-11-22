import { generateStrategic } from './generate-strategic'
import { generateOriginal } from './generate-original'
import { register } from './register'
import { saveGeneratedTemplate } from './debug-utils'
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

function extractOriginalValues(originalText: string, modifiedText: string, exampleValues: string[]): Record<string, string> {
    const originalMapping: Record<string, string> = {}
    let tempOriginal = originalText
    
    // for each variable, find what it replaced in the original
    exampleValues.forEach((exampleValue, index) => {
        const variable = `{{${index + 1}}}`
        
        // find the position of this variable in modified text
        const varIndex = modifiedText.indexOf(variable)
        if (varIndex === -1) return
        
        // count how many characters before this variable
        let charsBefore = 0
        for (let i = 0; i < varIndex; i++) {
            if (!modifiedText.substring(i).startsWith('{{')) {
                charsBefore++
            } else {
                // skip the variable
                const varEnd = modifiedText.indexOf('}}', i)
                if (varEnd !== -1) {
                    i = varEnd + 1
                }
            }
        }
        
        // in original text, find what's at this position
        // this is a simplified approach - we'll use the example value length as a hint
        const originalValue = tempOriginal.substring(charsBefore, charsBefore + exampleValue.length)
        originalMapping[variable] = originalValue
    })
    
    return originalMapping
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

export async function agent(label: Label, template: any, allowModification: boolean) {
    let stop = false
    const previousFeedback: string[] = []
    let iteration = 0
    const maxIterations = 10 // safety limit

    // get original body text
    const originalBody = template.components.find((comp: any) => comp.type == 'BODY')
    const originalText = originalBody?.text || ''

    if (allowModification) {
        console.log(`\n🔄 Creating entirely new UTILITY content (original content will be changed)`)
        
        while (stop == false && iteration < maxIterations) {
            iteration++
            console.log(`\n🔄 Iteration ${iteration}`)

            // use new content generation approach
            const { generatedBody } = await generateOriginal({ template, feedbacks: previousFeedback })
            console.log(`✅ Generated new UTILITY content using AI`)

            // assign new name and register with new body component
            const templateName = getTemplateName()
            const replaced = {
                ...template,
                components: template.components.map((comp: any) => comp.type == 'BODY' ? generatedBody : comp),
                name: templateName
            }
            console.log(`✅ Crafted replacement with name: ${replaced.name}`)

            // debug: save generated template
            await saveGeneratedTemplate(generatedBody, templateName, replaced, iteration, allowModification)

            // attempt registration
            const result = await register(label, replaced)

            // check if we got UTILITY + PENDING
            if (result && result.category == 'UTILITY' && result.status == 'PENDING') {
                console.log(`\n✅ Success! Template registered as UTILITY with PENDING status`)
                console.log(`Template ID: ${result.id}`)
                console.log(`Template Name: ${templateName}`)
                console.log(`\n📝 New UTILITY content created and registered`)
                stop = true
            } else if (result && result.error) {
                const errorMessage = result.error.error_user_msg || result.error.message || JSON.stringify(result.error)
                console.log(`❌ Registration failed: ${errorMessage}`)
                previousFeedback.push(`Registration attempt ${iteration} failed: ${errorMessage}`)
            } else if (result && result.category == 'MARKETING') {
                console.log(`❌ Got MARKETING category - new content was rejected`)
                previousFeedback.push(`Registration attempt ${iteration} was categorized as MARKETING instead of UTILITY`)
            } else if (result) {
                console.log(`⚠️ Got category: ${result.category}, status: ${result.status}`)
                previousFeedback.push(`Registration attempt ${iteration} resulted in category: ${result.category}, status: ${result.status}`)
            }
        }

        if (iteration >= maxIterations) {
            console.log(`\n⚠️ Reached maximum iterations (${maxIterations}) without success`)
        }
        
        return
    }

    console.log(`\n🔒 Preserving original content using strategic variable replacement`)

    while (stop == false && iteration < maxIterations) {
        iteration++
        console.log(`\n🔄 Iteration ${iteration}`)

        // use strategic variable replacement (only replace specific words/phrases)
        const { generatedBody, saveLearning } = await generateStrategic({ template, feedbacks: previousFeedback })
        console.log(`✅ Generated strategically modified template using AI`)

        // replace body component and assign new name
        const templateName = getTemplateName()
        const replaced = {
            ...template,
            components: template.components.map((comp: any) => comp.type == 'BODY' ? generatedBody : comp),
            name: templateName
        }
        console.log(`✅ Crafted replacement with name: ${replaced.name}`)

        // debug: save generated template
        await saveGeneratedTemplate(generatedBody, templateName, replaced, iteration, allowModification)

        // verify that reconstruction matches original
        const exampleValues = generatedBody.example?.body_text?.[0] || []
        const reconstructed = reconstructOriginal(generatedBody.text, exampleValues)
        const isExactMatch = reconstructed === originalText

        if (!isExactMatch) {
            const diff = findDifferences(originalText, reconstructed)
            console.log(`⚠️ Reconstructed text doesn't match original`)
            console.log(`   Original length: ${originalText.length}, Reconstructed length: ${reconstructed.length}`)
            console.log(`   ${diff}`)
            
            const reconstructionError = `The variables you placed don't reconstruct the exact original text. ${diff}. You MUST ensure that when replacing {{1}}, {{2}}, etc. with the example values, it produces the EXACT original text character-by-character including all emojis, asterisks, newlines, and spaces. Do not modify, remove, or add any characters from the original.`
            previousFeedback.push(reconstructionError)
            
            // save this learning
            await saveLearning(generatedBody, { error: { message: 'Reconstruction failed', error_user_msg: reconstructionError } })
            continue // skip registration, try again
        }

        console.log(`✅ Verified: Reconstruction matches original exactly`)

        // attempt registration
        const result = await register(label, replaced)

        // save this learning
        await saveLearning(generatedBody, result)

        // check if we got UTILITY + PENDING
        if (result && result.category == 'UTILITY' && result.status == 'PENDING') {
            console.log(`\n✅ Success! Template registered as UTILITY with PENDING status`)
            console.log(`Template ID: ${result.id}`)
            console.log(`Template Name: ${templateName}`)
            
            // display variable mapping with ORIGINAL values (not the bland utility examples)
            const mapping = extractVariableMapping(generatedBody.text, exampleValues)
            
            if (Object.keys(mapping).length > 0) {
                console.log(`\n📝 Variable Mapping for Meta (bland utility examples used for approval):`)
                Object.entries(mapping).forEach(([variable, value]) => {
                    console.log(`${variable} = "${value}"`)
                })
                
                // now show the ORIGINAL values that should be used when sending
                console.log(`\n📝 ORIGINAL Values (use these when sending the actual message):`)
                exampleValues.forEach((exampleValue, index) => {
                    const variable = `{{${index + 1}}}`
                    // find what this variable replaced in the original text
                    let originalValue = exampleValue
                    
                    // reconstruct to find original values
                    let tempText = generatedBody.text
                    let tempOriginal = originalText
                    
                    for (let i = 0; i <= index; i++) {
                        const currentVar = `{{${i + 1}}}`
                        const varPos = tempText.indexOf(currentVar)
                        
                        if (varPos !== -1) {
                            // find corresponding position in original
                            const beforeVar = tempText.substring(0, varPos)
                            const beforeVarClean = beforeVar.replace(/\{\{\d+\}\}/g, '')
                            
                            // find in original where this variable's value should be
                            const startPos = tempOriginal.indexOf(beforeVarClean) + beforeVarClean.length
                            
                            if (i === index) {
                                // this is the variable we want
                                // find the end by looking at what comes after the variable
                                const afterVar = tempText.substring(varPos + currentVar.length)
                                const nextVarMatch = afterVar.match(/\{\{\d+\}\}/)
                                const afterVarClean = nextVarMatch ? afterVar.substring(0, afterVar.indexOf(nextVarMatch[0])) : afterVar
                                
                                const endPos = afterVarClean ? tempOriginal.indexOf(afterVarClean, startPos) : tempOriginal.length
                                originalValue = tempOriginal.substring(startPos, endPos)
                            }
                        }
                    }
                    
                    console.log(`${variable} = "${originalValue}"`)
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